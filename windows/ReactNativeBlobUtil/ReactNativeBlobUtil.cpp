#include "pch.h"

#include "ReactNativeBlobUtil.h"
#include <winrt/Windows.ApplicationModel.Activation.h>
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Security.Cryptography.Core.h>
#include <winrt/Windows.Security.Cryptography.Certificates.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.Pickers.h>
#include <winrt/Windows.Web.Http.h>
#include <winrt/Windows.Web.Http.Headers.h>
#include <winrt/windows.web.http.filters.h>
#include <winrt/Windows.System.Threading.h>
#include <algorithm>
#include <cctype>
#include <cwchar>
#include <cwctype>
#include <filesystem>
#include <optional>
#include <string_view>
#include <sstream>
#include <fstream>
#include <shobjidl_core.h>
#include <bits.h>

using namespace winrt;
using namespace winrt::Windows::ApplicationModel;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Storage::Streams;
using namespace winrt::Windows::Foundation;
using namespace winrt::Windows::Security::Cryptography;
using namespace winrt::Windows::Security::Cryptography::Core;
using namespace std::chrono_literals;

namespace
{
    // The error slot of the fetch callbacks: {code, message}, the shape fetch.js
    // turns into an Error with a code.
    ::React::JSValue fetchError(std::string code, std::string message)
    {
        ::React::JSValueObject error;
        error["code"] = std::move(code);
        error["message"] = std::move(message);
        return ::React::JSValue{ std::move(error) };
    }

    ::React::ReactError rejection(std::string code, std::string message)
    {
        return ::React::ReactError{ std::move(code), std::move(message) };
    }

    // The StorageFolder/StorageFile path APIs want a native absolute path;
    // JavaScript hands in forward slashes.
    winrt::hstring nativePath(std::string const& path)
    {
        std::filesystem::path p{ path };
        p.make_preferred();
        return winrt::hstring{ p.wstring() };
    }

    // Any HTTP method, as Android and iOS accept. The module used to allow only
    // GET, POST, PUT and DELETE and reject PATCH, HEAD and OPTIONS.
    winrt::Windows::Web::Http::HttpMethod httpMethodFor(std::string method)
    {
        std::transform(method.begin(), method.end(), method.begin(),
            [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
        return winrt::Windows::Web::Http::HttpMethod{ winrt::to_hstring(method) };
    }

    // The path behind a file reference: wrap()'s ReactNativeBlobUtil-file://, or
    // the bare file:// that was the only prefix Windows read before 1.0.
    std::string pathOfFileReference(std::string const& reference)
    {
        for (std::string const prefix : { std::string{ "ReactNativeBlobUtil-file://" }, std::string{ "file://" } })
        {
            if (reference.rfind(prefix, 0) == 0)
            {
                return reference.substr(prefix.length());
            }
        }
        return reference;
    }

    // Base64 read the way Android and iOS read it: a character outside the
    // alphabet (whitespace, a line break, anything else) is skipped and missing
    // padding is supplied. CryptographicBuffer rejects all of that with "Bad
    // Data", so a body the other two platforms send failed here.
    IBuffer DecodeBase64Leniently(std::string const& text)
    {
        std::string clean;
        clean.reserve(text.size());
        for (const char c : text)
        {
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/')
            {
                clean.push_back(c);
            }
        }
        // A lone trailing character encodes no whole byte; Android drops it.
        if (clean.size() % 4 == 1)
        {
            clean.pop_back();
        }
        while (clean.size() % 4 != 0)
        {
            clean.push_back('=');
        }
        return CryptographicBuffer::DecodeFromBase64String(winrt::to_hstring(clean));
    }

    // Base64 written to a file, read by the rule Android uses: the alphabet, "="
    // and whitespace are accepted, line breaks and missing padding included, and
    // anything else is refused (nullopt) rather than skipped, so a payload that is
    // not base64 at all fails instead of writing nothing. CryptographicBuffer
    // alone rejected the line breaks and missing padding the other platforms
    // accept (#267).
    std::optional<IBuffer> DecodeBase64ForFile(std::string const& text)
    {
        for (const char c : text)
        {
            const bool alphabet{ (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '+' || c == '/' };
            if (!alphabet && c != '=' && c != ' ' && c != '\t' && c != '\r' && c != '\n')
            {
                return std::nullopt;
            }
        }
        if (text.find_first_not_of("= \t\r\n") == std::string::npos)
        {
            return CryptographicBuffer::CreateFromByteArray(std::vector<uint8_t>{});
        }
        return DecodeBase64Leniently(text);
    }

    // A path from JavaScript as std::filesystem sees it. JS strings arrive as
    // UTF-8, which a std::filesystem::path built from a narrow string would read
    // in the ANSI code page.
    std::filesystem::path FsPath(std::string const& path)
    {
        std::filesystem::path p{ std::wstring{ winrt::to_hstring(path) } };
        p.make_preferred();
        return p;
    }

    bool IsDirectory(std::string const& path)
    {
        std::error_code ec;
        return std::filesystem::is_directory(FsPath(path), ec);
    }

    bool PathExists(std::string const& path)
    {
        std::error_code ec;
        return std::filesystem::exists(FsPath(path), ec);
    }

    // The bytes a buffer holds; none for a null buffer, which is what an empty
    // string converts to.
    std::vector<uint8_t> BytesOf(IBuffer const& buffer)
    {
        if (!buffer || buffer.Length() == 0)
        {
            return {};
        }
        auto reader{ DataReader::FromBuffer(buffer) };
        std::vector<uint8_t> bytes(reader.UnconsumedBufferLength());
        reader.ReadBytes(bytes);
        return bytes;
    }

    // UTF-8 bytes as text, each invalid sequence read as U+FFFD, as Android and
    // iOS read it. CryptographicBuffer::ConvertBinaryToString fails on the first
    // invalid byte instead ("No mapping for the Unicode character exists in the
    // target multi-byte code page").
    std::string DecodeUtf8(uint8_t const* data, size_t size)
    {
        if (size == 0)
        {
            return {};
        }
        auto source{ reinterpret_cast<char const*>(data) };
        const int length{ MultiByteToWideChar(CP_UTF8, 0, source, static_cast<int>(size), nullptr, 0) };
        std::wstring wide(static_cast<size_t>(length), L'\0');
        MultiByteToWideChar(CP_UTF8, 0, source, static_cast<int>(size), wide.data(), length);
        return winrt::to_string(wide);
    }

    // Where a chunk of UTF-8 can be cut without splitting a character: the
    // length of its complete characters. The bytes after it are the start of a
    // character the next chunk finishes.
    size_t CompleteUtf8Length(std::vector<uint8_t> const& bytes)
    {
        const size_t size{ bytes.size() };
        for (size_t back = 1; back <= 3 && back <= size; ++back)
        {
            const uint8_t byte{ bytes[size - back] };
            if ((byte & 0xC0) == 0x80)
            {
                continue; // a continuation byte; its lead is further back
            }
            if (byte < 0xC0)
            {
                return size; // ASCII, or a stray byte decoded as U+FFFD
            }
            const size_t needed{ byte >= 0xF0 ? 4u : byte >= 0xE0 ? 3u : 2u };
            return needed > back ? size - back : size;
        }
        return size;
    }

    // Whether bytes are UTF-8 throughout, as Android's strict decoder checks.
    bool IsValidUtf8(std::vector<uint8_t> const& bytes)
    {
        if (bytes.empty())
        {
            return true;
        }
        return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, reinterpret_cast<char const*>(bytes.data()),
            static_cast<int>(bytes.size()), nullptr, 0) != 0;
    }

    // The RNFB-Response request header, which the library reads and does not
    // send: its lower-case value goes to config.responseFormat.
    bool TakeResponseFormat(std::string const& name, ::React::JSValue const& value, ReactNativeBlobUtilConfig& config)
    {
        if (_stricmp(name.c_str(), "RNFB-Response") != 0)
        {
            return false;
        }
        std::string format{ value.Type() == ::React::JSValueType::String ? value.AsString() : "" };
        std::transform(format.begin(), format.end(), format.begin(),
            [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        config.responseFormat = format;
        return true;
    }

    // A request header the HTTP stack has to own. A caller's Transfer-Encoding
    // made every request fail ("Both 'Content-Length' and 'Transfer-Encoding:
    // chunked' headers can not be specified at the same time"); without it the
    // body goes out with a Content-Length, as iOS sends it.
    bool IsFramingHeader(std::string const& name)
    {
        return _stricmp(name.c_str(), "Transfer-Encoding") == 0;
    }

    // The lower-case hex MD5 of a string's UTF-8 bytes: the cache file name of
    // a `key`, as Android and iOS name it.
    std::string Md5Hex(std::string const& text)
    {
        auto provider{ HashAlgorithmProvider::OpenAlgorithm(HashAlgorithmNames::Md5()) };
        auto hashed{ provider.HashData(CryptographicBuffer::ConvertStringToBinary(winrt::to_hstring(text), BinaryStringEncoding::Utf8)) };
        return winrt::to_string(CryptographicBuffer::EncodeToHexString(hashed));
    }

    // A buffer's bytes as base64; "" for an empty buffer.
    std::string EncodeBase64(std::vector<uint8_t> const& bytes)
    {
        if (bytes.empty())
        {
            return "";
        }
        return winrt::to_string(CryptographicBuffer::EncodeToBase64String(CryptographicBuffer::CreateFromByteArray(bytes)));
    }

    // Milliseconds since the Unix epoch as a FILETIME value (100 ns since 1601).
    LARGE_INTEGER FileTimeOfMillis(double millis)
    {
        LARGE_INTEGER value;
        value.QuadPart = (static_cast<int64_t>(millis) + 11644473600000LL) * 10000LL;
        return value;
    }

    // A WinRT DateTime in milliseconds since the Unix epoch.
    int64_t MillisOf(winrt::Windows::Foundation::DateTime const& time)
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>(time.time_since_epoch()).count() - 11644473600000LL;
    }

    winrt::Windows::Storage::ApplicationDataContainer BackgroundRecords()
    {
        return ApplicationData::Current().LocalSettings().CreateContainer(L"rnbu-background", ApplicationDataCreateDisposition::Always);
    }

    // One field per line; a line break inside a value becomes a space.
    std::string EncodeBackgroundRecord(BackgroundRecord const& record)
    {
        auto clean = [](std::string value)
        {
            std::replace(value.begin(), value.end(), '\n', ' ');
            std::replace(value.begin(), value.end(), '\r', ' ');
            return value;
        };
        return clean(record.url) + "\n" + clean(record.path) + "\n" + record.guid + "\n" + record.state + "\n"
            + std::to_string(record.written) + "\n" + std::to_string(record.total) + "\n"
            + clean(record.errorCode) + "\n" + clean(record.errorMessage);
    }

    std::optional<BackgroundRecord> DecodeBackgroundRecord(std::string const& id, std::string const& text)
    {
        std::vector<std::string> parts;
        size_t from{ 0 };
        for (;;)
        {
            const auto at{ text.find('\n', from) };
            parts.push_back(text.substr(from, at == std::string::npos ? std::string::npos : at - from));
            if (at == std::string::npos) break;
            from = at + 1;
        }
        if (parts.size() < 8)
        {
            return std::nullopt;
        }
        BackgroundRecord record{ id, parts[0], parts[1], parts[2], parts[3] };
        try
        {
            record.written = std::stoll(parts[4]);
            record.total = std::stoll(parts[5]);
        }
        catch (...)
        {
        }
        record.errorCode = parts[6];
        record.errorMessage = parts[7];
        return record;
    }

    std::optional<BackgroundRecord> ReadBackgroundRecord(std::string const& id)
    {
        const auto value{ BackgroundRecords().Values().TryLookup(winrt::to_hstring(id)) };
        if (!value)
        {
            return std::nullopt;
        }
        return DecodeBackgroundRecord(id, winrt::to_string(winrt::unbox_value_or<winrt::hstring>(value, L"")));
    }

    void WriteBackgroundRecord(BackgroundRecord const& record)
    {
        BackgroundRecords().Values().Insert(winrt::to_hstring(record.id), winrt::box_value(winrt::to_hstring(EncodeBackgroundRecord(record))));
    }

    void RemoveBackgroundRecord(std::string const& id)
    {
        BackgroundRecords().Values().Remove(winrt::to_hstring(id));
    }

    std::vector<BackgroundRecord> AllBackgroundRecords()
    {
        std::vector<BackgroundRecord> out;
        for (auto const& entry : BackgroundRecords().Values())
        {
            const auto text{ winrt::unbox_value_or<winrt::hstring>(entry.Value(), L"") };
            if (auto record{ DecodeBackgroundRecord(winrt::to_string(entry.Key()), winrt::to_string(text)) })
            {
                out.push_back(*record);
            }
        }
        return out;
    }

    // The response info a finished background download reports.
    ::React::JSValueObject BackgroundInfo(BackgroundRecord const& record)
    {
        ::React::JSValueObject info;
        info["taskId"] = record.id;
        info["state"] = "2";
        info["status"] = record.state == "completed" ? 200 : 0;
        info["headers"] = ::React::JSValueObject{};
        ::React::JSValueArray redirects;
        redirects.push_back(::React::JSValue{ record.url });
        info["redirects"] = std::move(redirects);
        info["respType"] = "blob";
        info["timeout"] = false;
        return info;
    }

    // The contents of a request body's file. Throws when it cannot be read.
    IAsyncOperation<IBuffer> readRequestFile(std::string path)
    {
        auto file = co_await StorageFile::GetFileFromPathAsync(nativePath(path));
        co_return co_await FileIO::ReadBufferAsync(file);
    }

    // Why an upload source could not be read, as (code, message), the codes
    // Android and iOS report: ENOENT when it is not there, EISDIR for a
    // directory, EACCES when the app may not read it (#502).
    std::pair<std::string, std::string> UploadSourceError(std::string const& path, winrt::hresult const& code)
    {
        std::error_code ec;
        const std::filesystem::path target{ nativePath(path).c_str() };
        if (std::filesystem::is_directory(target, ec))
        {
            return { "EISDIR", "Expecting a file but '" + path + "' is a directory" };
        }
        if (!std::filesystem::exists(target, ec))
        {
            return { "ENOENT", "No such file '" + path + "'" };
        }
        if (code == E_ACCESSDENIED)
        {
            return { "EACCES", "Not allowed to read '" + path + "'" };
        }
        return { "EUNSPECIFIED", "Could not read '" + path + "'" };
    }

    // Android's rules: text/* is "text", application/json "json", any other
    // Content-Type "blob", none "text"; a response written to a file is "blob".
    std::string RespTypeFor(std::string contentType, bool toFile)
    {
        std::transform(contentType.begin(), contentType.end(), contentType.begin(),
            [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        if (toFile) return "blob";
        if (contentType.empty() || contentType.find("text/") != std::string::npos) return "text";
        if (contentType.find("application/json") != std::string::npos) return "json";
        return "blob";
    }

    // The response info Android and iOS report, which fetch.js turns into
    // res.info(), res.status, res.ok, res.headers and res.url. Windows reported
    // none, so res.status was undefined and res.ok always false there.
    ::React::JSValueObject ResponseInfo(
        winrt::Windows::Web::Http::HttpResponseMessage const& response,
        std::string const& taskId,
        std::vector<std::string> const& redirects,
        bool toFile)
    {
        ::React::JSValueObject headers;
        std::string contentType;
        for (auto const& header : response.Headers())
        {
            headers[winrt::to_string(header.Key())] = winrt::to_string(header.Value());
        }
        if (response.Content() != nullptr)
        {
            for (auto const& header : response.Content().Headers())
            {
                const auto key = winrt::to_string(header.Key());
                headers[key] = winrt::to_string(header.Value());
                std::string lowered = key;
                std::transform(lowered.begin(), lowered.end(), lowered.begin(),
                    [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
                if (lowered == "content-type")
                {
                    contentType = winrt::to_string(header.Value());
                }
            }
        }
        ::React::JSValueArray redirectList;
        for (auto const& url : redirects)
        {
            redirectList.push_back(::React::JSValue{ url });
        }
        ::React::JSValueObject info;
        info["taskId"] = taskId;
        info["state"] = "2";
        info["status"] = static_cast<int64_t>(response.StatusCode());
        info["headers"] = std::move(headers);
        info["redirects"] = std::move(redirectList);
        info["respType"] = RespTypeFor(contentType, toFile);
        info["timeout"] = false;
        return info;
    }

    // The code for a failed request, from the WinINet/WinHTTP HRESULT the
    // Windows.Web.Http stack raises. Names follow POSIX/Node so an app can
    // switch on them the same way on every platform.
    std::string codeFor(winrt::hresult_error const& ex)
    {
        switch (static_cast<uint32_t>(ex.code()))
        {
        case 0x80072EE2: // WININET_E_TIMEOUT
            return "ETIMEDOUT";
        case 0x80072EE5: // WININET_E_INVALID_URL
            return "EINVAL";
        case 0x80072EE7: // WININET_E_NAME_NOT_RESOLVED
            return "ENOTFOUND";
        case 0x80072EFD: // WININET_E_CANNOT_CONNECT
            return "ECONNREFUSED";
        case 0x80072EFE: // WININET_E_CONNECTION_ABORTED
        case 0x80072EFF: // WININET_E_CONNECTION_RESET
            return "ECONNRESET";
        case 0x80072F0D: // WININET_E_INVALID_CA
        case 0x80072F06: // WININET_E_SEC_CERT_CN_INVALID
        case 0x80072F05: // WININET_E_SEC_CERT_DATE_INVALID
        case 0x80072F19: // WININET_E_SEC_CERT_REV_FAILED
        case 0x80072F7D: // WININET_E_SECURITY_CHANNEL_ERROR
        case 0x80072F8F: // WININET_E_DECODING_FAILED / secure failure
        // What a certificate the system does not trust fails with when an earlier
        // request to the same server accepted it (`trusty: true`); the system then
        // refuses with this code instead of WININET_E_INVALID_CA.
        case 0x800C000E: // INET_E_SECURITY_PROBLEM
            return "ESSL";
        case 0x800704C7: // ERROR_CANCELLED
            return "ECANCELED";
        default:
            return "EUNSPECIFIED";
        }
    }
}

CancellationDisposable::CancellationDisposable(IAsyncInfo const& async, std::function<void()>&& onCancel) noexcept
	: m_async{ async }
	, m_onCancel{ std::move(onCancel) }
{
}

CancellationDisposable::CancellationDisposable(CancellationDisposable&& other) noexcept
	: m_async{ std::move(other.m_async) }
	, m_onCancel{ std::move(other.m_onCancel) }
{
}

CancellationDisposable& CancellationDisposable::operator=(CancellationDisposable&& other) noexcept
{
	if (this != &other)
	{
		CancellationDisposable temp{ std::move(*this) };
		m_async = std::move(other.m_async);
		m_onCancel = std::move(other.m_onCancel);
	}
	return *this;
}

CancellationDisposable::~CancellationDisposable() noexcept
{
	Cancel();
}

void CancellationDisposable::Cancel() noexcept
{
	if (m_async)
	{
		if (m_async.Status() == AsyncStatus::Started)
		{
			m_async.Cancel();
		}

		if (m_onCancel)
		{
			m_onCancel();
		}
	}
}

TaskCancellationManager::~TaskCancellationManager() noexcept
{
	// Do the explicit cleaning to make sure that CancellationDisposable
	// destructors run while this instance still has valid fields because
	// they are used by the onCancel callback.
	// We also want to clear the m_pendingTasks before running the
	// CancellationDisposable destructors since they touch the m_pendingTasks.
	std::map<TaskId, CancellationDisposable> pendingTasks;
	{
		std::scoped_lock lock{ m_mutex };
		pendingTasks = std::move(m_pendingTasks);
	}
}


IAsyncAction TaskCancellationManager::Add(TaskId taskId, IAsyncAction const& asyncAction) noexcept
{
	std::scoped_lock lock{ m_mutex };
	m_pendingTasks.try_emplace(taskId, asyncAction, [this, taskId]()
		{
			Cancel(taskId);
		});
	return asyncAction;
}

void TaskCancellationManager::Cancel(TaskId taskId) noexcept
{
	// The destructor of the token does the cancellation. We must do it outside of lock.
	CancellationDisposable token;

	{
		std::scoped_lock lock{ m_mutex };
		if (!m_pendingTasks.empty())
		{
			if (auto it = m_pendingTasks.find(taskId); it != m_pendingTasks.end())
			{
				token = std::move(it->second);
				m_pendingTasks.erase(it);
			}
		}
	}
}

ReactNativeBlobUtilConfig::ReactNativeBlobUtilConfig(::React::JSValue& options)
{
    auto getStringOrDefault = [](const winrt::Microsoft::ReactNative::JSValue& value, const std::string& defaultValue = "") -> std::string {
        return value.IsNull() ? defaultValue : value.AsString();
    };

    auto getBoolOrDefault = [](const winrt::Microsoft::ReactNative::JSValue& value, bool defaultValue = false) -> bool {
        return value.IsNull() ? defaultValue : value.AsBoolean();
    };

    auto getInt64OrDefault = [](const winrt::Microsoft::ReactNative::JSValue& value, int64_t defaultValue = 60000) -> int64_t {
        return value.IsNull() ? defaultValue : value.AsInt64();
    };

    appendExt = getStringOrDefault(options["appendExt"]);
    // Never read before, so a `key` cached nothing: each request downloaded
    // again, to a new file.
    key = getStringOrDefault(options["key"]);
    fileCache = getBoolOrDefault(options["fileCache"]);
    // Both default to true, as on Android and iOS; they defaulted to false here.
    followRedirect = getBoolOrDefault(options["followRedirect"], true);
    overwrite = getBoolOrDefault(options["overwrite"], true);
    trusty = getBoolOrDefault(options["trusty"]);

    trustSystemCerts = getBoolOrDefault(options["trustSystemCerts"]);
    bodyType = getStringOrDefault(options["bodyType"]);
    if (options["range"].Type() == ::React::JSValueType::Object)
    {
        auto const& range{ options["range"].AsObject() };
        auto const from{ range.find("from") };
        if (from != range.end() && !from->second.IsNull())
        {
            rangeFrom = from->second.AsInt64();
            auto const ifRange{ range.find("ifRange") };
            rangeIfRange = ifRange != range.end() && !ifRange->second.IsNull() ? ifRange->second.AsString() : "";
        }
    }

    auto getStringList = [](const winrt::Microsoft::ReactNative::JSValue& value) -> std::vector<std::string> {
        std::vector<std::string> result;
        if (value.IsNull())
        {
            return result;
        }

        for (const auto& item : value.AsArray())
        {
            if (!item.IsNull())
            {
                result.push_back(item.AsString());
            }
        }

        return result;
    };

    customCACerts = getStringList(options["customCACerts"]);
    pinnedHosts = getStringList(options["pinnedHosts"]);

    // Handle path sanitization
    {
        std::string filepath = getStringOrDefault(options["path"]);
        if (!filepath.empty())
        {
            size_t fileLength = filepath.length();
            bool hasTrailingSlash = filepath[fileLength - 1] == '\\' || filepath[fileLength - 1] == '/';
            std::filesystem::path pathToParse = hasTrailingSlash ? filepath.substr(0, fileLength - 1) : filepath;
            // Kept as the caller wrote it, so res.path() and background.list()
            // give back the path they were given, as on Android and iOS. The file
            // calls turn it into a native path where they use it.
            path = pathToParse.string();
        }
        else
        {
            path = "";
        }
    }

    // Timeout handling
    int64_t potentialTimeout = getInt64OrDefault(options["timeout"]);
    timeout = std::chrono::milliseconds{ potentialTimeout > 0 ? potentialTimeout : 60000 };
}

ReactNativeBlobUtilProgressConfig::ReactNativeBlobUtilProgressConfig(double count_, double interval_) : count(count_), interval(interval_) {
}

ReactNativeBlobUtilStream::ReactNativeBlobUtilStream(Streams::IRandomAccessStream& _streamInstance, EncodingOptions _encoding) noexcept
	: streamInstance{ std::move(_streamInstance) }
	, encoding{ _encoding }
{
}

namespace
{
    namespace Certificates = winrt::Windows::Security::Cryptography::Certificates;

    // Mirrors ReactNativeBlobUtilUtils.customCACertsApplyTo on Android and the
    // pinnedHosts check on iOS: when pinnedHosts is set the custom CA only covers
    // those hosts, and anything else falls through to the platform trust store.
    bool CustomCACertsApplyTo(const ReactNativeBlobUtilConfig& config, const winrt::Windows::Foundation::Uri& uri)
    {
        if (config.customCACerts.empty())
        {
            return false;
        }

        if (config.pinnedHosts.empty())
        {
            return true;
        }

        const auto host = winrt::to_string(uri.Host());
        return std::find(config.pinnedHosts.begin(), config.pinnedHosts.end(), host) != config.pinnedHosts.end();
    }

    winrt::Windows::Storage::Streams::IBuffer DerFromPem(const winrt::hstring& text)
    {
        std::wstring body{ text };
        for (const auto* marker : { L"-----BEGIN CERTIFICATE-----", L"-----END CERTIFICATE-----" })
        {
            for (auto pos = body.find(marker); pos != std::wstring::npos; pos = body.find(marker))
            {
                body.erase(pos, wcslen(marker));
            }
        }

        // iswspace covers CR, LF, tab and space without needing escapes here.
        body.erase(std::remove_if(body.begin(), body.end(), [](wchar_t c) { return iswspace(c) != 0; }), body.end());

        if (body.empty())
        {
            return nullptr;
        }

        try
        {
            return winrt::Windows::Security::Cryptography::CryptographicBuffer::DecodeFromBase64String(winrt::hstring{ body });
        }
        catch (...)
        {
            return nullptr;
        }
    }

    // Certificates ship inside the app package, the Windows counterpart of the iOS
    // main bundle (the same folder reported as MainBundleDir). DER and PEM are both
    // accepted, matching the other two platforms.
    std::vector<Certificates::Certificate> LoadCustomCACerts(const std::vector<std::string>& names)
    {
        std::vector<Certificates::Certificate> certs;

        // Packaged apps resolve against the install location, the counterpart of the
        // iOS main bundle. Unpackaged ones have no Package::Current() at all - that
        // call throws - so fall back to the directory holding the executable, which is
        // where a loose certificate would sit. Without this every custom-CA request
        // from an unpackaged app fails closed with nothing to explain why.
        std::filesystem::path root;
        try
        {
            root = std::filesystem::path{ winrt::to_string(Package::Current().InstalledLocation().Path()) };
        }
        catch (...)
        {
            wchar_t modulePath[MAX_PATH]{};
            const auto length = GetModuleFileNameW(nullptr, modulePath, static_cast<DWORD>(std::size(modulePath)));
            if (length == 0 || length == std::size(modulePath))
            {
                return certs;
            }

            root = std::filesystem::path{ modulePath }.parent_path();
        }

        for (const auto& name : names)
        {
            for (const auto* ext : { "", ".cer", ".der", ".pem", ".crt" })
            {
                const auto candidate = root / (name + ext);
                std::error_code ec;
                if (!std::filesystem::exists(candidate, ec) || ec)
                {
                    continue;
                }

                try
                {
                    auto file = StorageFile::GetFileFromPathAsync(winrt::hstring{ candidate.wstring() }).get();
                    winrt::Windows::Storage::Streams::IBuffer buffer{ nullptr };

                    if (std::string_view{ ext } == ".pem")
                    {
                        buffer = DerFromPem(FileIO::ReadTextAsync(file).get());
                    }
                    else
                    {
                        buffer = FileIO::ReadBufferAsync(file).get();
                    }

                    if (buffer)
                    {
                        certs.emplace_back(Certificates::Certificate{ buffer });
                        break;
                    }
                }
                catch (...)
                {
                    // wrong encoding for this extension - try the next one
                }
            }
        }

        return certs;
    }

    // Errors a private CA is expected to produce, and the only ones the custom-CA
    // path forgives.
    //
    // Untrusted is the point of the exercise: the root is deliberately not in the
    // system store. The revocation pair comes with it - a private CA publishes no
    // CRL and runs no OCSP responder, so Windows cannot determine revocation status
    // and says so. The chain built below disables revocation checking for exactly
    // that reason, and curl against the same server reports the same thing
    // (CERT_TRUST_REVOCATION_STATUS_UNKNOWN).
    //
    // Everything else stays fatal: a name mismatch, an expired or actually revoked
    // certificate, a broken chain. That keeps Windows aligned with SecTrust on iOS
    // and OkHttp's default verifier on Android.
    bool IsRevocationUnknown(Certificates::ChainValidationResult error)
    {
        return error == Certificates::ChainValidationResult::RevocationInformationMissing
            || error == Certificates::ChainValidationResult::RevocationFailure;
    }

    bool IsForgivableForCustomCA(Certificates::ChainValidationResult error)
    {
        return error == Certificates::ChainValidationResult::Untrusted || IsRevocationUnknown(error);
    }

    // Whether the chain ends at one of the configured certificates. A chain is
    // ordered leaf first, so the last entry is the root it was built to. Comparing
    // the encoded certificate rather than the thumbprint keeps this an identity
    // check rather than a digest match.
    bool ChainReachesOneOf(
        Certificates::CertificateChain const& chain,
        const std::vector<Certificates::Certificate>& roots)
    {
        const auto certificates = chain.GetCertificates(true);
        if (certificates.Size() == 0)
        {
            return false;
        }

        const auto reached = certificates.GetAt(certificates.Size() - 1).GetCertificateBlob();
        for (const auto& root : roots)
        {
            if (winrt::Windows::Security::Cryptography::CryptographicBuffer::Compare(
                    reached, root.GetCertificateBlob()))
            {
                return true;
            }
        }

        return false;
    }

    // Whether the server's certificate chains to a root in the system store.
    //
    // The stack's own verdict is not enough for this. Once any request in the
    // process has accepted a server's certificate with an error ignored - trusty,
    // or a custom CA - later requests to that server are accepted without the
    // certificate being evaluated again, even on a fresh full handshake. So the
    // chain is built and checked here.
    //
    // Revocation status that cannot be determined is not held against the
    // certificate, so a public server stays reachable while its CRL or OCSP
    // responder is not. A certificate that is actually revoked stays fatal.
    winrt::Windows::Foundation::IAsyncOperation<bool> ChainsToSystemRoot(
        winrt::Windows::Web::Http::Filters::HttpServerCustomValidationRequestedEventArgs args)
    {
        try
        {
            const auto chain = co_await args.ServerCertificate().BuildChainAsync(args.ServerIntermediateCertificates());
            const auto result = chain.Validate();
            co_return result == Certificates::ChainValidationResult::Success || IsRevocationUnknown(result);
        }
        catch (...)
        {
            co_return false;
        }
    }

    // Holds a request that trusts only the system store to that store.
    //
    // When the stack does evaluate the certificate it refuses an untrusted one
    // before this runs; the handler is for the connections where it does not -
    // see ChainsToSystemRoot.
    void ConfigureSystemTrust(winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter const& filter)
    {
        filter.ServerCustomValidationRequested([](
            winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter const&,
            winrt::Windows::Web::Http::Filters::HttpServerCustomValidationRequestedEventArgs const& args) -> winrt::fire_and_forget
        {
            auto eventArgs = args;
            auto deferral = eventArgs.GetDeferral();

            bool trusted = eventArgs.ServerCertificateErrors().Size() == 0;
            if (trusted)
            {
                trusted = co_await ChainsToSystemRoot(eventArgs);
            }

            if (!trusted)
            {
                eventArgs.Reject();
            }

            deferral.Complete();
        });
    }

    // Installs trust evaluation on the filter for a request that is not trusty:
    // the custom CA where it applies, the system store everywhere else.
    //
    // Exercised by tests/e2e/appium/scenarios/tls.js against the HTTPS server in
    // tests/e2e/server.js, whose certificate is signed by a throwaway private CA.
    void ConfigureServerTrust(
        winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter const& filter,
        const ReactNativeBlobUtilConfig& config,
        winrt::Windows::Foundation::Uri const& uri)
    {
        if (!CustomCACertsApplyTo(config, uri))
        {
            ConfigureSystemTrust(filter);
            return;
        }

        // These abort the handshake before the validation event fires, so they have
        // to be ignorable for the handler below to get a say. It re-checks them, and
        // everything not listed here stays fatal at the stack level.
        filter.IgnorableServerCertificateErrors().Append(Certificates::ChainValidationResult::Untrusted);
        filter.IgnorableServerCertificateErrors().Append(Certificates::ChainValidationResult::RevocationInformationMissing);
        filter.IgnorableServerCertificateErrors().Append(Certificates::ChainValidationResult::RevocationFailure);

        filter.ServerCustomValidationRequested([certNames = config.customCACerts, trustSystemCerts = config.trustSystemCerts](
            winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter const&,
            winrt::Windows::Web::Http::Filters::HttpServerCustomValidationRequestedEventArgs const& args) -> winrt::fire_and_forget
        {
            auto eventArgs = args;
            auto deferral = eventArgs.GetDeferral();

            bool onlyForgivable = true;
            for (const auto& error : eventArgs.ServerCertificateErrors())
            {
                if (!IsForgivableForCustomCA(error))
                {
                    onlyForgivable = false;
                    break;
                }
            }

            if (!onlyForgivable)
            {
                eventArgs.Reject();
                deferral.Complete();
                co_return;
            }

            // An empty error list alone does not vouch for the system store - see
            // ChainsToSystemRoot.
            if (trustSystemCerts
                && eventArgs.ServerCertificateErrors().Size() == 0
                && co_await ChainsToSystemRoot(eventArgs))
            {
                deferral.Complete();
                co_return;
            }

            const auto roots = LoadCustomCACerts(certNames);
            if (roots.empty())
            {
                // Fail closed. Accepting here would hand the caller the system trust
                // store under the name of a pinned connection.
                eventArgs.Reject();
                deferral.Complete();
                co_return;
            }

            // ChainBuildingParameters is not usable here: BuildChainAsync throws
            // E_BOUNDS as soon as it is handed one, whatever it contains, so
            // ExclusiveTrustRoots cannot be the way the chain is anchored to our CA.
            //
            // Supply the configured roots as additional certificates instead and
            // check what the chain was built to. Without them the engine has no
            // issuer to follow and stops at IncompleteChain; with them it verifies
            // issuer signatures as usual, so a certificate that merely carries our
            // CA's name fails here with InvalidSignature.
            auto candidates = winrt::single_threaded_vector<Certificates::Certificate>();
            for (const auto& intermediate : eventArgs.ServerIntermediateCertificates())
            {
                candidates.Append(intermediate);
            }
            for (const auto& root : roots)
            {
                candidates.Append(root);
            }

            try
            {
                const auto chain = co_await eventArgs.ServerCertificate().BuildChainAsync(candidates);

                // Untrusted is what we are here to forgive - our CA is deliberately
                // not in the system store - and a revocation result says nothing
                // either, since a private CA publishes no CRL or OCSP responder.
                // Anything else - expired, wrong name, bad signature, broken
                // constraints - is a real fault and stays fatal.
                const auto result = chain.Validate();
                const bool onlyMissingTrust =
                    result == Certificates::ChainValidationResult::Success
                    || IsForgivableForCustomCA(result);

                if (!onlyMissingTrust || !ChainReachesOneOf(chain, roots))
                {
                    eventArgs.Reject();
                }
            }
            catch (...)
            {
                eventArgs.Reject();
            }

            deferral.Complete();
        });
    }

    // Mirrors ReactNativeBlobUtilProgressConfig.shouldReport on Android: report
    // once at least `interval` milliseconds have passed and, when `count` is
    // set, once the transfer has crossed into a new 1/count slice. Both default
    // to -1, which reports on every callback.

    // A malformed URL used to take the whole process down - a fast-fail in
    // ucrtbase - rather than reporting an error, so the URL is parsed here,
    // before anything else, and a bad one is reported through the callback like
    // any other failure. A URL with no host counts as bad: that is what a
    // mistyped "//" leaves behind, as in "http:--127.0.0.1:19076".
    bool TryParseRequestUri(const std::string& url, winrt::Windows::Foundation::Uri& uri)
    {
        try
        {
            winrt::Windows::Foundation::Uri parsed{ winrt::to_hstring(url) };
            if (parsed.Host().empty())
            {
                return false;
            }

            uri = parsed;
            return true;
        }
        catch (...)
        {
            return false;
        }
    }

    // Whether appendExt can be appended to a generated cache file name: no
    // separator, drive colon or control character (GHSA-5xf6-f6v8-jc8c). JS
    // checks first; this covers a caller that reaches native directly.
    bool IsSafeExtension(std::string const& ext)
    {
        return std::none_of(ext.begin(), ext.end(), [](char c) {
            return c == '/' || c == '\\' || c == ':' || static_cast<unsigned char>(c) < 0x20;
        });
    }

    // A generated response file: ReactNativeBlobUtilTmp_<name> plus appendExt, as
    // on Android, under the directory fs.dirs reports as CacheDir so JS can stat,
    // session and unlink it.
    std::string CacheFilePath(const ReactNativeBlobUtilConfig& config, const std::string& name)
    {
        std::string path = winrt::to_string(
            winrt::Windows::Storage::ApplicationData::Current().LocalCacheFolder().Path())
            + "\\ReactNativeBlobUtilTmp_" + name;
        if (!config.appendExt.empty())
        {
            path += "." + config.appendExt;
        }

        return path;
    }

    // Where a response is written when the caller asked for a file: an explicit
    // path, or the request's own file in the cache.
    std::string ResponseFilePath(const ReactNativeBlobUtilConfig& config, const std::string& taskId)
    {
        return config.path.empty() ? CacheFilePath(config, taskId) : config.path;
    }

    // The file a `key` keeps its response in, named after the key's MD5 as on
    // Android and iOS, so a later request with the same key finds it. Empty
    // without a key, and with a path, which a key never applied to.
    std::string KeyFilePath(const ReactNativeBlobUtilConfig& config)
    {
        return config.key.empty() || !config.path.empty() ? std::string{} : CacheFilePath(config, Md5Hex(config.key));
    }

    // A request with a `key` whose file is already there resolves with that
    // file and sends nothing, as on Android and iOS: the second fetch of a key
    // used to download it again, to a new file. The response info is only
    // rnfbEncode then, as Android and iOS report it.
    template <typename Callback>
    bool CachedByKey(ReactNativeBlobUtilConfig const& config, std::string const& taskId, Callback const& callback)
    {
        const std::string cached{ KeyFilePath(config) };
        if (cached.empty() || !PathExists(cached) || IsDirectory(cached))
        {
            return false;
        }
        callback(std::nullopt, "path", cached, std::nullopt);
        return true;
    }

    // Hands the response to fetch.js in the shape it expects: a file reference
    // when the caller asked for one through fileCache or path - the same
    // contract as Android and iOS, so res.path() resolves - and the decoded text
    // otherwise.
    // The start offset of a 206 response's Content-Range, or -1.
    int64_t RangeStartOf(winrt::Windows::Web::Http::HttpResponseMessage const& response)
    {
        if (response.Content() == nullptr)
        {
            return -1;
        }
        const auto range{ response.Content().Headers().TryLookup(L"Content-Range") };
        if (!range)
        {
            return -1;
        }
        const std::string text{ winrt::to_string(range.value()) };
        const auto at{ text.find("bytes ") };
        if (at == std::string::npos)
        {
            return -1;
        }
        try
        {
            return std::stoll(text.substr(at + 6));
        }
        catch (...)
        {
            return -1;
        }
    }

    winrt::Windows::Foundation::IAsyncAction DeliverResponseAsync(
        winrt::Windows::Web::Http::HttpResponseMessage response,
        ReactNativeBlobUtilConfig config,
        std::string taskId,
        std::function<void(std::optional<::React::JSValue>, std::optional<std::string>, std::optional<std::string>, std::optional<::React::JSValue>)> callback,
        ::React::JSValueObject info,
        std::function<void(uint64_t, int64_t)> progress,
        std::function<bool(winrt::Windows::Foundation::IAsyncInfo const&)> reading,
        std::function<void()> readDone)
    {
        if (!config.fileCache && config.path.empty())
        {
            std::vector<uint8_t> body;
            bool lengthKnown{ false };
            if (response.Content() != nullptr)
            {
                lengthKnown = response.Content().Headers().ContentLength() != nullptr;
                body = BytesOf(co_await response.Content().ReadAsBufferAsync());
            }
            // Without a Content-Length the stack's progress says (n, -1) to the
            // end; once the body is in, it is (n, n), as on Android and iOS and as
            // a download to a file here reports it (#235, #292).
            if (!lengthKnown && !body.empty())
            {
                progress(body.size(), static_cast<int64_t>(body.size()));
            }

            // (err, rawType, data, responseInfo) as four arguments - the shape
            // fetch.js destructures and the one Android already sends. The form
            // is Android's: the text when the bytes are UTF-8 and base64 when
            // they are not, unless RNFB-Response asks for one. ReadAsStringAsync
            // decoded by the response's charset - Latin-1 for text/plain without
            // one, so "héllo" arrived as "hÃ©llo" - and every body went out as
            // utf8, so a binary one was corrupted.
            const bool asBase64{ config.responseFormat == "base64"
                || (config.responseFormat != "utf8" && !IsValidUtf8(body)) };
            if (asBase64)
            {
                callback(std::nullopt, "base64", EncodeBase64(body), ::React::JSValue{ std::move(info) });
            }
            else
            {
                callback(std::nullopt, "utf8", DecodeUtf8(body.data(), body.size()), ::React::JSValue{ std::move(info) });
            }
            co_return;
        }

        const std::string destination = ResponseFilePath(config, taskId);
        const std::filesystem::path path{ std::filesystem::path{ destination }.make_preferred() };

        // Android and iOS write to a path whose directory does not exist yet -
        // see the issue-453 case in the network scenario - so Windows creates
        // the missing parents rather than failing to open them.
        std::error_code fsError;
        std::filesystem::create_directories(path.parent_path(), fsError);

        // overwrite: false appends to an existing file, as on Android and iOS.
        bool append{ !config.overwrite && std::filesystem::exists(path, fsError) };
        bool write{ true };
        int64_t offset{ 0 };
        const int status{ static_cast<int>(response.StatusCode()) };
        if (config.rangeFrom >= 0 && status != 200)
        {
            // A resumed download: 206 from the offset asked for continues the file
            // there; anything else - an error status, 416, a 206 from elsewhere -
            // leaves the file as it is, and fetch.js decides. 200 replaces it.
            append = false;
            write = status == 206 && RangeStartOf(response) == config.rangeFrom;
            if (write)
            {
                offset = config.rangeFrom;
                if (!std::filesystem::exists(path, fsError))
                {
                    std::ofstream{ path, std::ios::binary };
                }
                std::filesystem::resize_file(path, static_cast<uintmax_t>(offset), fsError);
            }
        }

        std::ofstream out;
        if (write)
        {
            out.open(path, std::ios::binary | (offset > 0 || append ? std::ios::app : std::ios::trunc));
            if (!out)
            {
                callback(fetchError("EUNSPECIFIED", "Could not open '" + destination + "' to write the response"), std::nullopt, std::nullopt, ::React::JSValue{ std::move(info) });
                co_return;
            }
        }

        int64_t length{ -1 };
        uint64_t received{ 0 };
        if (response.Content() != nullptr)
        {
            const auto declared{ response.Content().Headers().ContentLength() };
            if (declared)
            {
                length = static_cast<int64_t>(declared.Value());
            }
            auto input{ co_await response.Content().ReadAsInputStreamAsync() };
            winrt::Windows::Storage::Streams::Buffer chunk{ 64 * 1024 };
            for (;;)
            {
                auto read{ input.ReadAsync(chunk, chunk.Capacity(), winrt::Windows::Storage::Streams::InputStreamOptions::Partial) };
                if (!reading(read))
                {
                    read.Cancel();
                }
                winrt::Windows::Storage::Streams::IBuffer data{ nullptr };
                try
                {
                    data = co_await read;
                }
                catch (...)
                {
                    readDone();
                    throw;
                }
                readDone();
                if (data.Length() == 0)
                {
                    break;
                }
                if (write)
                {
                    out.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.Length()));
                    if (!out)
                    {
                        callback(fetchError("EUNSPECIFIED", "Could not write '" + destination + "'"), std::nullopt, std::nullopt, ::React::JSValue{ std::move(info) });
                        co_return;
                    }
                }
                received += data.Length();
                progress(offset + received, length < 0 ? -1 : offset + length);
            }
        }
        out.close();

        // A body that ended short of its Content-Length: what arrived is on disk.
        if (length >= 0 && static_cast<int64_t>(received) < length)
        {
            callback(fetchError("ECONNRESET", "Download interrupted."), std::nullopt, std::nullopt, ::React::JSValue{ std::move(info) });
            co_return;
        }
        if (length < 0)
        {
            progress(offset + received, static_cast<int64_t>(offset + received));
        }

        // A response with a `key` becomes the key's file once it has arrived
        // whole with a success status. It used to be written to that file
        // directly, where a download cut short or an error page was a hit for
        // every later request. Anything else stays the request's own file: an
        // error status still resolves with its body there.
        const std::string kept{ KeyFilePath(config) };
        if (!kept.empty() && status >= 200 && status < 300)
        {
            const std::filesystem::path keptPath{ std::filesystem::path{ kept }.make_preferred() };
            std::filesystem::remove(keptPath, fsError);
            std::filesystem::rename(path, keptPath, fsError);
            if (!fsError)
            {
                callback(std::nullopt, "path", kept, ::React::JSValue{ std::move(info) });
                co_return;
            }
        }

        callback(std::nullopt, "path", destination, ::React::JSValue{ std::move(info) });
    }
}

namespace winrt::ReactNativeBlobUtil
{

    // See https://microsoft.github.io/react-native-windows/docs/native-modules for details on writing native modules

    void ReactNativeBlobUtil::Initialize(React::ReactContext const& reactContext) noexcept {
        m_context = reactContext;
    }

    // Constants method
    ReactNativeBlobUtilCodegen::BlobUtilsSpec_Constants ReactNativeBlobUtil::GetConstants() noexcept {
        ReactNativeBlobUtilCodegen::BlobUtilsSpec_Constants constants;
        constants.DocumentDir = to_string(ApplicationData::Current().LocalFolder().Path());
        constants.CacheDir = to_string(ApplicationData::Current().LocalCacheFolder().Path());
        constants.PictureDir = to_string(UserDataPaths::GetDefault().Pictures());
        constants.MusicDir = to_string(UserDataPaths::GetDefault().Music());
        constants.MovieDir = to_string(UserDataPaths::GetDefault().Videos());
        constants.DownloadDir = to_string(UserDataPaths::GetDefault().Downloads());
        constants.MainBundleDir = to_string(Package::Current().InstalledLocation().Path());
        constants.LibraryDir = to_string(ApplicationData::Current().LocalFolder().Path());
        constants.ApplicationSupportDir = to_string(ApplicationData::Current().RoamingFolder().Path());
        constants.DCIMDir = to_string(UserDataPaths::GetDefault().CameraRoll());
        constants.TemporaryDir = to_string(ApplicationData::Current().TemporaryFolder().Path());
        constants.RoamingDir = to_string(ApplicationData::Current().RoamingFolder().Path());
        constants.ExternalCacheDir = "";
        // Android only: "" rather than a missing key, as on iOS.
        constants.RingtoneDir = "";
        constants.SDCardDir = "";
        constants.SDCardApplicationDir = "";
        constants.LegacyDCIMDir = "";
        constants.LegacyPictureDir = "";
        constants.LegacyMusicDir = "";
        constants.LegacyDownloadDir = "";
        constants.LegacyMovieDir = "";
        constants.LegacyRingtoneDir = "";
        constants.LegacySDCardDir = "";
        return constants;
    }

    void ReactNativeBlobUtil::WatchProgress(
        winrt::Windows::Foundation::IAsyncOperationWithProgress<winrt::Windows::Web::Http::HttpResponseMessage, winrt::Windows::Web::Http::HttpProgress> const& operation,
        std::string taskId,
        bool reportDownload)
    {
        // SendRequestAsync reports both directions, so one handler covers upload
        // and download. The config is looked up on every callback rather than
        // once here, because fetch.js starts the request first and only then
        // calls enableProgressReport() - at send time the entry does not exist
        // yet. Android looks it up per chunk for the same reason.
        ProgressThrottle downloadThrottle, uploadThrottle;
        operation.Progress([this, taskId, reportDownload, downloadThrottle, uploadThrottle](
            auto const&, winrt::Windows::Web::Http::HttpProgress const& progress) mutable
        {
            const bool sending{ progress.Stage == winrt::Windows::Web::Http::HttpProgressStage::SendingContent };

            // Only the two stages that move bytes. The others - resolving,
            // connecting, negotiating TLS - would otherwise report zero-byte
            // progress for every phase of the connection.
            if (!sending && progress.Stage != winrt::Windows::Web::Http::HttpProgressStage::ReceivingContent)
            {
                return;
            }
            // A download to a file reads its body itself and reports as it writes.
            if (!sending && !reportDownload)
            {
                return;
            }

            {
                std::scoped_lock lock{ m_mutex };
                const auto& configs{ sending ? uploadProgressMap : downloadProgressMap };
                const auto entry{ configs.find(taskId) };
                if (entry == configs.end())
                {
                    return;
                }

                (sending ? uploadThrottle : downloadThrottle).config = entry->second;
            }

            const uint64_t written{ sending ? progress.BytesSent : progress.BytesReceived };
            const auto expected{ sending ? progress.TotalBytesToSend : progress.TotalBytesToReceive };
            const int64_t total{ expected ? static_cast<int64_t>(expected.Value()) : -1 };

            auto& throttle{ sending ? uploadThrottle : downloadThrottle };
            if (!throttle.ShouldReport(written, total > 0 ? static_cast<uint64_t>(total) : 0))
            {
                return;
            }

            // Numbers, matching what Android and iOS emit, with -1 as the
            // unknown-length sentinel they already use.
            m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit",
                sending ? L"ReactNativeBlobUtilProgress-upload" : L"ReactNativeBlobUtilProgress",
                winrt::Microsoft::ReactNative::JSValueObject{
                    {"taskId", taskId},
                    {"written", static_cast<int64_t>(written)},
                    {"total", total},
                    {"chunk", ""},
                });
        });
    }

    winrt::Windows::Foundation::IAsyncOperation<winrt::Windows::Web::Http::HttpResponseMessage> ReactNativeBlobUtil::SendAsync(
        winrt::Windows::Web::Http::HttpRequestMessage request,
        ReactNativeBlobUtilConfig config,
        std::string taskId,
        std::shared_ptr<std::vector<std::string>> redirects,
        std::shared_ptr<bool> timedOut)
    {
        // Redirects are followed here rather than by the stack, one hop at a
        // time: each hop gets its own trust decision, so customCACerts and
        // pinnedHosts apply to the host that hop is for. Windows did not follow
        // redirects at all before 1.0. The first URL is listed too, as Android
        // lists every URL it requested.
        redirects->push_back(winrt::to_string(request.RequestUri().AbsoluteUri()));
        const bool toFile{ config.fileCache || !config.path.empty() };
        const bool resumed{ toFile && config.rangeFrom >= 0 };
        if (resumed)
        {
            // The bytes on disk are the identity encoding, so the range must be too.
            request.Headers().TryAppendWithoutValidation(L"Range", winrt::to_hstring("bytes=" + std::to_string(config.rangeFrom) + "-"));
            request.Headers().TryAppendWithoutValidation(L"Accept-Encoding", L"identity");
            if (!config.rangeIfRange.empty())
            {
                request.Headers().TryAppendWithoutValidation(L"If-Range", winrt::to_hstring(config.rangeIfRange));
            }
        }
        for (int hop = 0;; ++hop)
        {
            winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter filter;
            filter.AllowAutoRedirect(false);
            if (resumed)
            {
                filter.AutomaticDecompression(false);
            }
            if (config.trusty)
            {
                filter.IgnorableServerCertificateErrors().Append(
                    winrt::Windows::Security::Cryptography::Certificates::ChainValidationResult::Untrusted);
            }
            else
            {
                ConfigureServerTrust(filter, config, request.RequestUri());
            }
            winrt::Windows::Web::Http::HttpClient httpClient{ filter };

            // Cancelled while it was being built: it is not sent at all.
            if (RequestCancelled(taskId))
            {
                throw winrt::hresult_canceled();
            }
            // A download to a file returns once the headers are in and writes the
            // body as it arrives, so what came before a cancel or a lost
            // connection is on disk to continue from. It was read into memory in
            // full first, and nothing was written until the end.
            auto operation{ httpClient.SendRequestAsync(request, toFile
                ? winrt::Windows::Web::Http::HttpCompletionOption::ResponseHeadersRead
                : winrt::Windows::Web::Http::HttpCompletionOption::ResponseContentRead) };
            if (!RequestSending(taskId, operation))
            {
                operation.Cancel();
            }
            WatchProgress(operation, taskId, !toFile);
            // HttpClient has no timeout of its own: the operation is cancelled
            // when config.timeout runs out, and the caller reports ETIMEDOUT.
            auto timer = winrt::Windows::System::Threading::ThreadPoolTimer::CreateTimer(
                [operation, timedOut](auto&&) { *timedOut = true; operation.Cancel(); },
                config.timeout);
            winrt::Windows::Web::Http::HttpResponseMessage response{ nullptr };
            try
            {
                response = co_await operation;
            }
            catch (...)
            {
                timer.Cancel();
                RequestSent(taskId);
                throw;
            }
            timer.Cancel();
            RequestSent(taskId);

            const int status{ static_cast<int>(response.StatusCode()) };
            const auto location{ response.Headers().TryLookup(L"Location") };
            // Twenty hops at most, as OkHttp allows.
            if (!config.followRedirect || status < 300 || status >= 400 || !location || hop >= 20)
            {
                co_return response;
            }

            const winrt::Windows::Foundation::Uri next{ request.RequestUri().CombineUri(location.value()) };
            // As OkHttp: 307 and 308 repeat the request; 301, 302 and 303 turn
            // anything but GET and HEAD into a GET without a body.
            const auto method{ request.Method().Method() };
            const bool repeat{ status == 307 || status == 308 || method == L"GET" || method == L"HEAD" };
            winrt::Windows::Web::Http::HttpRequestMessage nextRequest{
                repeat ? request.Method() : winrt::Windows::Web::Http::HttpMethod::Get(), next };
            for (auto const& header : request.Headers())
            {
                nextRequest.Headers().TryAppendWithoutValidation(header.Key(), header.Value());
            }
            // Authorization does not follow to another host, port or scheme, as
            // with OkHttp. Only the host was compared, so the credentials went
            // on to another service on the same machine, and from https to http.
            const auto current{ request.RequestUri() };
            const bool sameOrigin{ next.Host() == current.Host() && next.Port() == current.Port() &&
                next.SchemeName() == current.SchemeName() };
            if (!sameOrigin && nextRequest.Headers().HasKey(L"Authorization"))
            {
                nextRequest.Headers().Remove(L"Authorization");
            }
            if (repeat && request.Content() != nullptr)
            {
                nextRequest.Content(request.Content());
            }
            redirects->push_back(winrt::to_string(next.AbsoluteUri()));
            request = nextRequest;
        }
    }

    winrt::Windows::Foundation::IAsyncAction ReactNativeBlobUtil::SendAndDeliverAsync(
        winrt::Windows::Web::Http::HttpRequestMessage request,
        ReactNativeBlobUtilConfig config,
        std::string taskId,
        std::function<void(std::optional<::React::JSValue>, std::optional<std::string>, std::optional<std::string>, std::optional<::React::JSValue>)> callback)
    {
        auto redirects = std::make_shared<std::vector<std::string>>();
        auto timedOut = std::make_shared<bool>(false);
        winrt::Windows::Web::Http::HttpResponseMessage response{ nullptr };
        bool failedOnTimeout{ false };
        try
        {
            response = co_await SendAsync(request, config, taskId, redirects, timedOut);
        }
        catch (winrt::hresult_error const&)
        {
            if (!*timedOut)
            {
                throw;
            }
            failedOnTimeout = true;
        }
        if (failedOnTimeout)
        {
            // What Android reports: ETIMEDOUT, and respInfo.timeout true.
            ::React::JSValueObject info;
            info["taskId"] = taskId;
            info["timeout"] = true;
            callback(fetchError("ETIMEDOUT", "The request timed out."), std::nullopt, std::nullopt, ::React::JSValue{ std::move(info) });
            co_return;
        }

        const bool toFile{ config.fileCache || !config.path.empty() };
        m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilState",
            ResponseInfo(response, taskId, *redirects, toFile));
        // Download progress of a body written to a file, throttled as WatchProgress throttles.
        auto throttle{ std::make_shared<ProgressThrottle>() };
        auto progress = [this, taskId, throttle](uint64_t written, int64_t total)
        {
            {
                std::scoped_lock lock{ m_mutex };
                const auto entry{ downloadProgressMap.find(taskId) };
                if (entry == downloadProgressMap.end())
                {
                    return;
                }
                throttle->config = entry->second;
            }
            if (!throttle->ShouldReport(written, total > 0 ? static_cast<uint64_t>(total) : 0))
            {
                return;
            }
            m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilProgress",
                winrt::Microsoft::ReactNative::JSValueObject{
                    {"taskId", taskId},
                    {"written", static_cast<int64_t>(written)},
                    {"total", total},
                    {"chunk", ""},
                });
        };
        // Each read of the body is what cancelRequest cancels while it streams.
        auto reading = [this, taskId](winrt::Windows::Foundation::IAsyncInfo const& read) { return RequestSending(taskId, read); };
        auto readDone = [this, taskId]() { RequestSent(taskId); };
        co_await DeliverResponseAsync(response, config, taskId, callback, ResponseInfo(response, taskId, *redirects, toFile), progress, reading, readDone);
    }

    winrt::fire_and_forget ReactNativeBlobUtil::fetchBlobForm(
        ::React::JSValue options,
        std::string taskId,
        std::string method,
        std::string url,
        ::React::JSValue headers,
        ::React::JSValueArray body,
        std::function<void(std::optional<::React::JSValue>, std::optional<std::string>, std::optional<std::string>, std::optional<::React::JSValue>)> callback
    ) noexcept
    {
        try
        {
            // Off the caller's thread before anything else. Reporting a failure
            // through the callback while still on it - which every check below
            // does, since none of them has suspended yet - took the whole process
            // down with a fast-fail instead of surfacing the error, while the same
            // callback after a suspension reports normally.
            co_await winrt::resume_background();
            // Known from here until it ends, so a cancel during the build counts.
            RequestStarted(taskId);
            struct RequestScope
            {
                ReactNativeBlobUtil* module;
                std::string id;
                ~RequestScope() { module->RequestEnded(id); }
            } requestScope{ this, taskId };

            winrt::Windows::Foundation::Uri requestUri{ nullptr };
            if (!TryParseRequestUri(url, requestUri))
            {
                callback(fetchError("EINVAL", "Invalid URL: " + url), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }

            // Random for each request. It was the constant "-----", which made
            // "-------" at the start of a line the delimiter between parts: a
            // row of dashes in an uploaded text or file ended the upload there,
            // and content written for it added form fields of its own.
            const winrt::hstring boundary{ L"ReactNativeBlobUtil-" +
                Cryptography::CryptographicBuffer::EncodeToHexString(Cryptography::CryptographicBuffer::GenerateRandom(16)) };
            ReactNativeBlobUtilConfig config{ options };
            if (!IsSafeExtension(config.appendExt))
            {
                callback(fetchError("EINVAL", "appendExt must be a file extension, without path separators"), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }
            if (CachedByKey(config, taskId, callback))
            {
                co_return;
            }

            winrt::Windows::Web::Http::HttpRequestMessage requestMessage{ httpMethodFor(method), requestUri };
            winrt::Windows::Web::Http::HttpMultipartFormDataContent requestContent{ boundary };

            // Add headers
            if (headers.ItemCount() > 0)
            {
                for (const auto& entry : headers.AsObject())
                {
                    if (TakeResponseFormat(entry.first, entry.second, config) || IsFramingHeader(entry.first))
                    {
                        continue;
                    }
                    if (!requestMessage.Headers().TryAppendWithoutValidation(
                        winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString())))
                    {
                        requestContent.Headers().TryAppendWithoutValidation(
                            winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString()));
                    }
                }
            }

            // Add form data. Each part's kind (text, base64 or file, decided in JS)
            // picks its content; the filename only changes the disposition. A part
            // without a name or data is skipped, as on Android and iOS.
            for (auto& entry : body)
            {
                auto& items = entry.AsObject();
                if (items["data"].IsNull() || items["name"].IsNull())
                {
                    continue;
                }
                auto data = items["data"].AsString();
                bool hasFilename = !items["filename"].IsNull();
                std::string kind = items["kind"].IsNull() ? "" : items["kind"].AsString();
                if (kind.empty())
                {
                    // Before JS sent the kind: a bare file:// prefix was a file, anything else text.
                    kind = data.rfind("file://", 0) == 0 ? "file" : "text";
                }

                IBuffer partBuffer{ nullptr };
                if (kind == "file")
                {
                    // A file that cannot be read fails the request before it is sent.
                    // The part used to go out empty (#502).
                    std::optional<std::pair<std::string, std::string>> unreadable;
                    try
                    {
                        partBuffer = co_await readRequestFile(pathOfFileReference(data));
                    }
                    catch (winrt::hresult_error const& ex)
                    {
                        unreadable = UploadSourceError(pathOfFileReference(data), ex.code());
                    }
                    if (unreadable)
                    {
                        callback(fetchError(unreadable->first, unreadable->second), std::nullopt, std::nullopt, std::nullopt);
                        co_return;
                    }
                }
                else if (kind == "base64")
                {
                    try
                    {
                        partBuffer = DecodeBase64Leniently(data);
                    }
                    catch (winrt::hresult_error const&)
                    {
                    }
                }
                else
                {
                    partBuffer = CryptographicBuffer::ConvertStringToBinary(winrt::to_hstring(data), BinaryStringEncoding::Utf8);
                }
                if (!partBuffer)
                {
                    partBuffer = Buffer{ 0u };
                }

                winrt::Windows::Web::Http::HttpBufferContent part{ partBuffer };
                // The defaults Android and iOS use.
                std::string type = items["type"].IsNull() ? (hasFilename ? "application/octet-stream" : "text/plain") : items["type"].AsString();
                part.Headers().TryAppendWithoutValidation(L"content-type", winrt::to_hstring(type));

                auto name = winrt::to_hstring(items["name"].AsString());
                if (hasFilename)
                {
                    requestContent.Add(part, name, winrt::to_hstring(items["filename"].AsString()));
                }
                else
                {
                    requestContent.Add(part, name);
                }
            }

            requestMessage.Content(requestContent);

            co_await SendAndDeliverAsync(requestMessage, config, taskId, callback);
        }
        catch (const winrt::hresult_error& ex)
        {
            callback(fetchError(codeFor(ex), winrt::to_string(ex.message())), std::nullopt, std::nullopt, std::nullopt);
        }
        catch (...)
        {
            callback(fetchError("EUNSPECIFIED", "Unknown error in fetchBlobForm"), std::nullopt, std::nullopt, std::nullopt);
        }
    }

    winrt::fire_and_forget ReactNativeBlobUtil::fetchBlob(
        ::React::JSValue options,
        std::string taskId,
        std::string method,
        std::string url,
        ::React::JSValue headers,
        std::string body,
        std::function<void(std::optional<::React::JSValue>, std::optional<std::string>, std::optional<std::string>, std::optional<::React::JSValue>)> callback
    ) noexcept
    {
        // Convert rvalue references to lvalues for safe use
        ::React::JSValue& optionsRef = options;
        ::React::JSValue& headersRef = headers;

        // A background download claims its id here, on the caller's thread and so
        // in the order JS made its calls: a second start, a forget or a cancel that
        // follows sees it, although each goes on to a background thread.
        const bool background{ optionsRef["background"].Type() == ::React::JSValueType::Object };
        const bool backgroundTaken{ background && !ClaimBackgroundStart(taskId, url,
            optionsRef["path"].Type() == ::React::JSValueType::String ? optionsRef["path"].AsString() : std::string{}) };

        try
        {
            // Off the caller's thread before anything else - see fetchBlobForm.
            co_await winrt::resume_background();
            // Known from here until it ends, so a cancel during the build counts.
            RequestStarted(taskId);
            struct RequestScope
            {
                ReactNativeBlobUtil* module;
                std::string id;
                ~RequestScope() { module->RequestEnded(id); }
            } requestScope{ this, taskId };

            winrt::Windows::Foundation::Uri requestUri{ nullptr };
            if (!TryParseRequestUri(url, requestUri))
            {
                callback(fetchError("EINVAL", "Invalid URL: " + url), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }

            ReactNativeBlobUtilConfig config{ optionsRef };
            if (!IsSafeExtension(config.appendExt))
            {
                callback(fetchError("EINVAL", "appendExt must be a file extension, without path separators"), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }
            if (!background && CachedByKey(config, taskId, callback))
            {
                co_return;
            }
            // A download that outlives the app: BITS runs it.
            if (background)
            {
                if (backgroundTaken)
                {
                    callback(fetchError("EEXIST", "A background download \"" + taskId + "\" is already running"), std::nullopt, std::nullopt, std::nullopt);
                    co_return;
                }
                StartBackgroundDownload(taskId, url, config.path, headersRef.Copy(), callback);
                co_return;
            }

            winrt::Windows::Web::Http::HttpRequestMessage requestMessage{ httpMethodFor(method), requestUri };

            // JS says what the body is (bodyType). Without it, the rule Windows used
            // before: a bare file:// prefix is a file, anything else text - base64
            // was never decoded, and wrap()'s prefix was sent as text.
            std::string kind = config.bodyType;
            if (kind.empty())
            {
                kind = body.rfind("file://", 0) == 0 ? "file" : "text";
            }

            IBuffer requestBuffer{ nullptr };
            if (!body.empty() && kind == "file")
            {
                std::string path = pathOfFileReference(body);
                std::optional<std::pair<std::string, std::string>> unreadable;
                try
                {
                    requestBuffer = co_await readRequestFile(path);
                }
                catch (winrt::hresult_error const& ex)
                {
                    unreadable = UploadSourceError(path, ex.code());
                }
                if (unreadable)
                {
                    callback(fetchError(unreadable->first, unreadable->second), std::nullopt, std::nullopt, std::nullopt);
                    co_return;
                }
                if (!requestBuffer)
                {
                    callback(fetchError("ENOENT", "No such file '" + path + "'"), std::nullopt, std::nullopt, std::nullopt);
                    co_return;
                }
            }
            else if (!body.empty() && kind == "base64")
            {
                requestBuffer = DecodeBase64Leniently(body);
            }
            else if (!body.empty())
            {
                // The UTF-8 bytes, without the text/plain Content-Type that
                // HttpStringContent adds when the caller gave none.
                requestBuffer = CryptographicBuffer::ConvertStringToBinary(winrt::to_hstring(body), BinaryStringEncoding::Utf8);
            }

            winrt::Windows::Web::Http::HttpBufferContent requestContent{ nullptr };
            if (requestBuffer)
            {
                requestContent = winrt::Windows::Web::Http::HttpBufferContent{ requestBuffer };
            }
            for (const auto& entry : headersRef.AsObject())
            {
                if (TakeResponseFormat(entry.first, entry.second, config) || IsFramingHeader(entry.first))
                {
                    continue;
                }
                if (!requestMessage.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString())) && requestContent)
                {
                    requestContent.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString()));
                }
            }
            if (requestContent)
            {
                requestMessage.Content(requestContent);
            }

            co_await SendAndDeliverAsync(requestMessage, config, taskId, callback);
        }
        catch (const winrt::hresult_error& ex)
        {
            callback(fetchError(codeFor(ex), winrt::to_string(ex.message())), std::nullopt, std::nullopt, std::nullopt);
        }
        catch (...)
        {
            callback(fetchError("EUNSPECIFIED", "Unknown error in fetchBlob"), std::nullopt, std::nullopt, std::nullopt);
        }
    }

    winrt::fire_and_forget ReactNativeBlobUtil::createFile(
        std::string path,
        std::wstring content,
        std::string encoding,
        winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept
    {
    try
    {
        Streams::IBuffer buffer;
        if (encoding.compare("uri") == 0)
        {
            // Looked for before anything is created: a missing source rejects
            // ENOENT, as on Android and iOS. It used to leave the promise unsettled.
            const std::string source{ winrt::to_string(content) };
            if (!PathExists(source) || IsDirectory(source))
            {
                promise.Reject(rejection("ENOENT", "Source file : " + source + " does not exist"));
                co_return;
            }
            winrt::hstring srcDirectoryPath, srcFileName;
            splitPath(content, srcDirectoryPath, srcFileName);
            StorageFolder srcFolder{ co_await StorageFolder::GetFolderFromPathAsync(srcDirectoryPath) };
            StorageFile srcFile{ co_await srcFolder.GetFileAsync(srcFileName) };
            buffer = co_await FileIO::ReadBufferAsync(srcFile);
        }
        else if (encoding.compare("utf8") == 0)
        {
            buffer = CryptographicBuffer::ConvertStringToBinary(content, BinaryStringEncoding::Utf8);
        }
        else if (encoding.compare("base64") == 0)
        {
            auto decoded{ DecodeBase64ForFile(winrt::to_string(content)) };
            if (!decoded)
            {
                promise.Reject(rejection("EINVAL", "Invalid base64 data"));
                co_return;
            }
            buffer = *decoded;
        }
        else
        {
            promise.Reject(rejection("EINVAL", "Invalid encoding " + encoding));
            co_return;
        }

        // EEXIST only when the file is there. Every failure from creating to
        // writing used to be reported as EEXIST, an empty file's included.
        if (PathExists(path))
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EEXIST", "EEXIST: File already exists; " + path });
            co_return;
        }

        winrt::hstring destDirectoryPath, destFileName;
        splitPath(path, destDirectoryPath, destFileName);
        auto folder{ co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath) };
        auto file{ co_await folder.CreateFileAsync(destFileName, CreationCollisionOption::FailIfExists) };
        // An empty string converts to a null buffer, which WriteAsync refuses.
        if (buffer && buffer.Length() > 0)
        {
            auto stream{ co_await file.OpenAsync(FileAccessMode::ReadWrite) };
            co_await stream.WriteAsync(buffer);
        }
        promise.Resolve();
        co_return;
    }
    catch (const hresult_error& ex)
    {
        hresult result{ ex.code() };
        if (result == HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND)) // FileNotFoundException
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "ENOENT", "ENOENT: File does not exist and could not be created; " + path });
        }
        else
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EUNSPECIFIED", "EUNSPECIFIED: " + winrt::to_string(ex.message()) + "; " + path });
        }
    }
}

    winrt::fire_and_forget ReactNativeBlobUtil::createFileASCII(
        std::string path,
        winrt::Microsoft::ReactNative::JSValueArray dataArray,
        winrt::Microsoft::ReactNative::ReactPromise<void> promise) noexcept {
        try
        {
            std::vector<uint8_t> data;
            data.reserve(dataArray.size());
            for (auto& var : dataArray)
            {
                data.push_back(var.AsUInt8());
            }

            Streams::IBuffer buffer{ CryptographicBuffer::CreateFromByteArray(data) };

            winrt::hstring directoryPath, fileName;
            splitPath(path, directoryPath, fileName);

            StorageFolder folder{ co_await StorageFolder::GetFolderFromPathAsync(directoryPath) };

            StorageFile file{ co_await folder.CreateFileAsync(fileName, CreationCollisionOption::FailIfExists) };
            Streams::IRandomAccessStream stream{ co_await file.OpenAsync(FileAccessMode::ReadWrite) };
            co_await stream.WriteAsync(buffer);

            promise.Resolve();
        }
        catch (const hresult_error& ex)
        {
            hresult result{ ex.code() };
            if (result == 0x80070002) // FileNotFoundException
            {
                promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "ENOENT", "ENOENT: File does not exist and could not be created; " + path });
            }
            else if (result == 0x80070050)
            {
                promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EEXIST", "EEXIST: File already exists; " + path });
            }
            else
            {
                promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EUNSPECIFIED", "EUNSPECIFIED: " + winrt::to_string(ex.message()) });
            }
        }
    }

    winrt::fire_and_forget ReactNativeBlobUtil::writeFile(
        std::string path,
        std::string encoding,
        std::wstring data,
        bool transformFile,
        bool append,
        winrt::Microsoft::ReactNative::ReactPromise<double> promise) noexcept
    {
        try
        {
            if (IsDirectory(path))
            {
                promise.Reject(rejection("EISDIR", "Expecting a file but '" + path + "' is a directory"));
                co_return;
            }
            Streams::IBuffer buffer;
            if (encoding.compare("utf8") == 0)
            {
                buffer = Cryptography::CryptographicBuffer::ConvertStringToBinary(data, BinaryStringEncoding::Utf8);
            }
            else if (encoding.compare("base64") == 0)
            {
                auto decoded{ DecodeBase64ForFile(winrt::to_string(data)) };
                if (!decoded)
                {
                    promise.Reject(rejection("EINVAL", "Invalid base64 data"));
                    co_return;
                }
                buffer = *decoded;
            }
            else if (encoding.compare("uri") == 0)
            {
                const std::string source{ winrt::to_string(data) };
                if (!PathExists(source) || IsDirectory(source))
                {
                    promise.Reject(rejection("ENOENT", "No such file '" + path + "' ('" + source + "')"));
                    co_return;
                }
                winrt::hstring srcDirectoryPath, srcFileName;
                splitPath(data, srcDirectoryPath, srcFileName);
                StorageFolder srcFolder{ co_await StorageFolder::GetFolderFromPathAsync(srcDirectoryPath) };
                StorageFile srcFile{ co_await srcFolder.GetFileAsync(srcFileName) };
                buffer = co_await FileIO::ReadBufferAsync(srcFile);
            }
            else
            {
                promise.Reject(rejection("EINVAL", "Invalid encoding: " + encoding));
                co_return;
            }

            // Missing parent directories are created, as Android and iOS create
            // them. GetFolderFromPathAsync only opens a folder, so a write into a
            // new directory failed with EUNSPECIFIED.
            std::error_code directoryError;
            std::filesystem::create_directories(FsPath(path).parent_path(), directoryError);

            winrt::hstring destDirectoryPath, destFileName;
            splitPath(path, destDirectoryPath, destFileName);
            StorageFolder destFolder{ co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath) };
            StorageFile destFile{ nullptr };
            if (append)
            {
                destFile = co_await destFolder.CreateFileAsync(destFileName, CreationCollisionOption::OpenIfExists);
            }
            else
            {
                destFile = co_await destFolder.CreateFileAsync(destFileName, CreationCollisionOption::ReplaceExisting);
            }
            Streams::IRandomAccessStream stream{ co_await destFile.OpenAsync(FileAccessMode::ReadWrite) };

            if (append)
            {
                stream.Seek(UINT64_MAX);
            }
            // An empty string converts to a null buffer, which WriteAsync refuses.
            const uint32_t written{ buffer ? buffer.Length() : 0 };
            if (written > 0)
            {
                co_await stream.WriteAsync(buffer);
            }
            promise.Resolve(static_cast<double>(written));
        }
        catch (const hresult_error& ex)
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EUNSPECIFIED", "EUNSPECIFIED: " + winrt::to_string(ex.message()) + "; " + path });
        }
    }

    winrt::fire_and_forget ReactNativeBlobUtil::writeFileArray(
        std::string path,
        winrt::Microsoft::ReactNative::JSValueArray dataArray,
        bool append,
        winrt::Microsoft::ReactNative::ReactPromise<double> promise) noexcept
    {
        try
        {
            std::vector<uint8_t> data;
            data.reserve(dataArray.size());
            for (auto& var : dataArray)
            {
                data.push_back(var.AsUInt8());
            }
            Streams::IBuffer buffer{ CryptographicBuffer::CreateFromByteArray(data) };

            winrt::hstring destDirectoryPath, destFileName;
            splitPath(path, destDirectoryPath, destFileName);
            StorageFolder destFolder{ co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath) };
            StorageFile destFile{ nullptr };
            if (append)
            {
                destFile = co_await destFolder.CreateFileAsync(destFileName, CreationCollisionOption::OpenIfExists);
            }
            else
            {
                destFile = co_await destFolder.CreateFileAsync(destFileName, CreationCollisionOption::ReplaceExisting);
            }
            Streams::IRandomAccessStream stream{ co_await destFile.OpenAsync(FileAccessMode::ReadWrite) };

            if (append)
            {
                stream.Seek(UINT64_MAX);
            }
            co_await stream.WriteAsync(buffer);
            promise.Resolve(static_cast<double>(buffer.Length()));

            co_return;
        }
        catch (const hresult_error& ex)
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EUNSPECIFIED", "EUNSPECIFIED: " + winrt::to_string(ex.message()) + "; " + path });
        }
    }

void ReactNativeBlobUtil::pathForAppGroup(
    std::string groupName,
    ::React::ReactPromise<std::string>&& result) noexcept
{
    result.Resolve("");
}

std::string ReactNativeBlobUtil::syncPathAppGroup(
    std::string groupName) noexcept
{
    return "";
}

void ReactNativeBlobUtil::exists(
    std::string path,
    ::React::ReactPromise<::React::JSValue>&& promise) noexcept
{
    ::React::JSValueObject result;
    try
    {
        std::filesystem::path fsPath(path);
        result["exists"] = std::filesystem::exists(fsPath);
        result["isDirectory"] = std::filesystem::is_directory(fsPath);
    }
    catch (const std::exception&)
    {
        result["exists"] = false;
        result["isDirectory"] = false;
    }
    promise.Resolve(::React::JSValue{ std::move(result) });
}

winrt::fire_and_forget ReactNativeBlobUtil::writeStream(
    std::string path,
    std::string encoding,
    bool appendData,
    ::React::ReactPromise<std::string> promise) noexcept
{
    try
    {
        if (IsDirectory(path))
        {
            promise.Reject(rejection("EISDIR", "Expecting a file but '" + path + "' is a directory"));
            co_return;
        }
        winrt::hstring directoryPath, fileName;
        splitPath(path, directoryPath, fileName);

        // Create missing parents: a stream may be opened at a path whose
        // directory does not exist yet - the issue-333 case deletes it first -
        // and GetFolderFromPathAsync opens a folder, it never creates one.
        std::error_code directoryError;
        std::filesystem::create_directories(std::filesystem::path{ path }.parent_path(), directoryError);

        auto folder = co_await StorageFolder::GetFolderFromPathAsync(directoryPath);
        auto file = co_await folder.CreateFileAsync(fileName, CreationCollisionOption::OpenIfExists);
        auto stream = co_await file.OpenAsync(FileAccessMode::ReadWrite);
        if (appendData)
        {
            stream.Seek(stream.Size());
        }

        EncodingOptions encodingOption;
        if (encoding == "utf8")
        {
            encodingOption = EncodingOptions::UTF8;
        }
        else if (encoding == "base64")
        {
            encodingOption = EncodingOptions::BASE64;
        }
        else if (encoding == "ascii")
        {
            encodingOption = EncodingOptions::ASCII;
        }
        else
        {
            promise.Reject(rejection("EINVAL", "Invalid encoding: " + encoding));
            co_return;
        }

        // Generate a random streamId
        uint32_t length = 16;
        IBuffer buffer = Cryptography::CryptographicBuffer::GenerateRandom(length);
        std::string streamId = winrt::to_string(Cryptography::CryptographicBuffer::EncodeToHexString(buffer));

        ReactNativeBlobUtilStream streamInstance{ stream, encodingOption };
        m_streamMap.try_emplace(streamId, streamInstance);

        promise.Resolve(streamId);
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", "Failed to create write stream at path '" + path + "'; " + winrt::to_string(ex.message())));
    }
}

void ReactNativeBlobUtil::writeArrayChunk(
    std::string streamId,
    ::React::JSValueArray&& dataArray,
    ::React::ReactPromise<void>&& promise) noexcept
{
    try
    {
        auto streamIt = m_streamMap.find(streamId);
        if (streamIt == m_streamMap.end()) {
            promise.Reject(rejection("EBADF", "No such write stream '" + streamId + "'"));
            return;
        }
        auto& stream = streamIt->second;
        std::vector<uint8_t> data;
        data.reserve(dataArray.size());
        for (auto& var : dataArray)
        {
            data.push_back(var.AsUInt8());
        }
        Streams::IBuffer buffer{ CryptographicBuffer::CreateFromByteArray(data) };

        stream.streamInstance.WriteAsync(buffer).get(); // Calls it synchronously
        promise.Resolve();
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
    }
}

void ReactNativeBlobUtil::writeChunk(
    std::string streamId,
    std::string data,
    ::React::ReactPromise<void>&& promise) noexcept
{
    try
    {
        auto streamIt = m_streamMap.find(streamId);
        if (streamIt == m_streamMap.end()) {
            promise.Reject(rejection("EBADF", "No such write stream '" + streamId + "'"));
            return;
        }
        auto& stream = streamIt->second;
        Streams::IBuffer buffer;
        if (stream.encoding == EncodingOptions::UTF8)
        {
            buffer = Cryptography::CryptographicBuffer::ConvertStringToBinary(
                winrt::to_hstring(data), BinaryStringEncoding::Utf8);
        }
        else if (stream.encoding == EncodingOptions::BASE64)
        {
            // The rule fs.writeFile uses: line breaks and missing padding are
            // accepted, and a chunk that is not base64 rejects EINVAL and writes
            // nothing. It used to reject EUNSPECIFIED "Bad Data.", the code of a
            // failure nobody could foresee rather than of a bad argument.
            auto decoded{ DecodeBase64ForFile(data) };
            if (!decoded)
            {
                promise.Reject(rejection("EINVAL", "Data for stream '" + streamId + "' is not valid base64"));
                return;
            }
            buffer = *decoded;
        }
        else
        {
            promise.Reject(rejection("EINVAL", "Invalid encoding type"));
            return;
        }
        stream.streamInstance.WriteAsync(buffer).get(); // Synchronous write
        promise.Resolve();
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
    }
}

void ReactNativeBlobUtil::closeStream(
    std::string streamId,
    ::React::ReactPromise<void>&& promise) noexcept
{
    try
    {
        auto it = m_streamMap.find(streamId);
        if (it == m_streamMap.end()) {
            promise.Reject(rejection("EBADF", "No such write stream '" + streamId + "'"));
            return;
        }
        it->second.streamInstance.Close();
        m_streamMap.erase(it);
        promise.Resolve();
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::unlink(
    std::string path,
    ::React::ReactPromise<void> promise) noexcept
{
   try
        {
            // Nothing there is what unlink asks for: it resolves, as on Android
            // and iOS. It rejected EUNSPECIFIED ("The system cannot find the file
            // specified"). The delete is permanent: the default moves the item
            // to the Recycle Bin when there is one, which is no place for an
            // app's own files.
            if (!PathExists(path))
            {
                promise.Resolve();
                co_return;
            }
            if (IsDirectory(path))
            {
                auto folder = co_await StorageFolder::GetFolderFromPathAsync(FsPath(path).c_str());
                co_await folder.DeleteAsync(StorageDeleteOption::PermanentDelete);
            }
            else
            {
                winrt::hstring directoryPath, fileName;
                splitPath(path, directoryPath, fileName);
                auto folder = co_await winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(directoryPath);
                auto item = co_await folder.GetItemAsync(fileName);
                co_await item.DeleteAsync(StorageDeleteOption::PermanentDelete);
            }

            promise.Resolve();
        }
        catch (const winrt::hresult_error& ex)
        {
            promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
        }
   
}

winrt::fire_and_forget ReactNativeBlobUtil::removeSession(::React::JSValueArray paths, ::React::ReactPromise<void> promise) noexcept
{
    try
    {
        for (const auto& pathValue : paths)
        {
            // A string, not a truthy value: JSValue's bool is AsBoolean(), which
            // for a string is true only for words such as "true" or "1", so
            // every path was skipped and dispose() resolved having removed
            // nothing.
            if (pathValue.Type() == ::React::JSValueType::String)
            {
                std::string path = pathValue.AsString();
                if (!PathExists(path) || IsDirectory(path))
                {
                    continue;
                }
                auto file = co_await winrt::Windows::Storage::StorageFile::GetFileFromPathAsync(FsPath(path).c_str());
                co_await file.DeleteAsync(StorageDeleteOption::PermanentDelete);
            }
        }

        promise.Resolve();
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
    }
    catch (...)
    {
        promise.Reject(rejection("EUNSPECIFIED", "Unknown error in removeSession"));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::ls(
    std::string path,
    ::React::ReactPromise<::React::JSValueArray> promise) noexcept
{
    try
    {
        if (!std::filesystem::exists(path))
        {
            promise.Reject(rejection("ENOENT", "No such file '" + path + "'"));
            co_return;
        }
        if (!std::filesystem::is_directory(path))
        {
            promise.Reject(rejection("ENOTDIR", "Not a directory '" + path + "'"));
            co_return;
        }
        auto folder = co_await Windows::Storage::StorageFolder::GetFolderFromPathAsync(nativePath(path));
        auto items = co_await folder.GetItemsAsync();

        ::React::JSValueArray results;
        for (const auto& item : items)
        {
            results.push_back(::React::JSValue{ winrt::to_string(item.Name()) });
        }

        promise.Resolve(results);
    }
    catch (const winrt::hresult_error& ex)
    {
        hresult result = ex.code();
        if (result == HRESULT_FROM_WIN32(ERROR_PATH_NOT_FOUND))
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "ENOTDIR", "Not a directory '" + path + "'" });
        }
        else
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EUNSPECIFIED", winrt::to_string(ex.message()) });
        }
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::stat(
    std::string path,
    ::React::ReactPromise<::React::JSValue> promise) noexcept
{
    try
    {
        std::filesystem::path givenPath(path);
        givenPath.make_preferred();
        bool isDirectory{ std::filesystem::is_directory(path) };

        //std::string resultPath{ winrt::to_string(givenPath.c_str()) };
        auto resultPath{ winrt::to_hstring(givenPath.c_str()) };

        // Try to open as folder
        IStorageItem item;
        if (isDirectory) {
            item = co_await StorageFolder::GetFolderFromPathAsync(resultPath);
        }
        else {
            item = co_await StorageFile::GetFileFromPathAsync(resultPath);
        }
        auto properties{ co_await item.GetBasicPropertiesAsync() };
        winrt::Microsoft::ReactNative::JSValueObject fileInfo;
        fileInfo["size"] = properties.Size();
        fileInfo["filename"] = givenPath.filename().string();
        fileInfo["path"] = givenPath.string();
        fileInfo["lastModified"] = static_cast<int64_t>(winrt::clock::to_time_t(properties.DateModified())) * 1000;
        fileInfo["created"] = static_cast<int64_t>(winrt::clock::to_time_t(item.DateCreated())) * 1000;
        fileInfo["type"] = isDirectory ? "directory" : "file";

        promise.Resolve(::React::JSValue{ std::move(fileInfo) });
    }
    catch (const hresult_error& ex)
    {
        // The item could not be opened: it is not there.
        promise.Reject(rejection("ENOENT", winrt::to_string(ex.message())));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::lstat(
    std::string path,
    ::React::ReactPromise<::React::JSValueArray> promise) noexcept
{
    try
    {
        std::filesystem::path target(path);
        target.make_preferred();

        auto describe = [](auto const& item, auto const& properties) {
            winrt::Microsoft::ReactNative::JSValueObject itemInfo;

            itemInfo["filename"] = to_string(item.Name());
            itemInfo["path"] = to_string(item.Path());
            itemInfo["size"] = properties.Size();
            itemInfo["type"] = item.IsOfType(StorageItemTypes::Folder) ? "directory" : "file";
            itemInfo["lastModified"] = properties.DateModified().time_since_epoch() / std::chrono::milliseconds(1) - UNIX_EPOCH_IN_WINRT_SECONDS * 1000;
            itemInfo["created"] = item.DateCreated().time_since_epoch() / std::chrono::milliseconds(1) - UNIX_EPOCH_IN_WINRT_SECONDS * 1000;

            return itemInfo;
        };

        winrt::Microsoft::ReactNative::JSValueArray resultsArray;

        // A directory lists its children, a file lists itself. That is the
        // contract Android's lstat follows, and what the e2e scenario expects
        // when it lstats the file it has just stat'ed; opening every path as a
        // folder failed on any file.
        if (std::filesystem::is_directory(target))
        {
            StorageFolder targetDirectory{ co_await StorageFolder::GetFolderFromPathAsync(target.c_str()) };

            auto items{ co_await targetDirectory.GetItemsAsync() };
            for (auto item : items)
            {
                auto properties{ co_await item.GetBasicPropertiesAsync() };
                resultsArray.push_back(describe(item, properties));
            }
        }
        else
        {
            StorageFile file{ co_await StorageFile::GetFileFromPathAsync(target.c_str()) };
            auto properties{ co_await file.GetBasicPropertiesAsync() };
            resultsArray.push_back(describe(file, properties));
        }

        promise.Resolve(std::move(resultsArray));
    }
    catch (...)
    {
        // A path that cannot be read is a failure, not an empty directory:
        // Android reports the same, and returning an empty list made
        // fs.lstat() look as though the path existed and held nothing.
        promise.Reject(rejection("ENOENT", "failed to lstat path `" + path + "` because it does not exist or it is not a folder"));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::cp(
    std::string src,
    std::string dest,
    ::React::ReactPromise<void> promise) noexcept
{
    try
    {
        std::filesystem::path from{ nativePath(src).c_str() };
        std::filesystem::path to{ nativePath(dest).c_str() };
        std::error_code ec;
        // A file is not copied into or over a directory; iOS refuses the same.
        if (std::filesystem::is_directory(to, ec))
        {
            promise.Reject(rejection("EEXIST", "Destination '" + dest + "' is a directory"));
            co_return;
        }
        // A directory is copied with everything in it, as iOS's copyItem does.
        if (std::filesystem::is_directory(from, ec))
        {
            if (!std::filesystem::is_directory(to.parent_path(), ec))
            {
                promise.Reject(rejection("ENOENT", "Destination directory of '" + dest + "' does not exist"));
                co_return;
            }
            auto const canonicalFrom{ std::filesystem::weakly_canonical(from, ec).wstring() };
            auto const canonicalTo{ std::filesystem::weakly_canonical(to, ec).wstring() };
            if (canonicalTo.rfind(canonicalFrom + L"\\", 0) == 0)
            {
                promise.Reject(rejection("EINVAL", "Cannot copy '" + src + "' into itself"));
                co_return;
            }
            if (std::filesystem::exists(to, ec) && !std::filesystem::remove(to, ec))
            {
                promise.Reject(rejection("EUNSPECIFIED", "Could not replace '" + dest + "'"));
                co_return;
            }
            std::filesystem::copy(from, to, std::filesystem::copy_options::recursive, ec);
            if (ec)
            {
                promise.Reject(rejection("EUNSPECIFIED", ec.message()));
                co_return;
            }
            promise.Resolve();
            co_return;
        }

        winrt::hstring srcDirectoryPath, srcFileName;
        splitPath(src, srcDirectoryPath, srcFileName);

        winrt::hstring destDirectoryPath, destFileName;
        splitPath(dest, destDirectoryPath, destFileName);

        StorageFolder srcFolder = co_await StorageFolder::GetFolderFromPathAsync(srcDirectoryPath);
        StorageFolder destFolder = co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath);

        StorageFile file = co_await srcFolder.GetFileAsync(srcFileName);
        co_await file.CopyAsync(destFolder, destFileName, NameCollisionOption::ReplaceExisting);

        promise.Resolve();
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection(ex.code() == HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND) || ex.code() == HRESULT_FROM_WIN32(ERROR_PATH_NOT_FOUND) ? "ENOENT" : "EUNSPECIFIED", winrt::to_string(ex.message())));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::mv(
    std::string src,
    std::string dest,
    ::React::ReactPromise<void> promise) noexcept
{
    try
    {
        std::filesystem::path from{ nativePath(src).c_str() };
        std::filesystem::path to{ nativePath(dest).c_str() };
        std::error_code ec;
        // A directory is not replaced; iOS and Android refuse the same.
        if (std::filesystem::is_directory(to, ec))
        {
            promise.Reject(rejection("EEXIST", "Destination '" + dest + "' is a directory"));
            co_return;
        }
        // A directory moves as a whole, as on iOS and Android; StorageFile only moves files.
        if (std::filesystem::is_directory(from, ec))
        {
            if (!std::filesystem::is_directory(to.parent_path(), ec))
            {
                promise.Reject(rejection("ENOENT", "mv failed because the destination directory doesn't exist"));
                co_return;
            }
            if (std::filesystem::exists(to, ec))
            {
                std::filesystem::remove(to, ec);
            }
            std::filesystem::rename(from, to, ec);
            if (ec)
            {
                promise.Reject(rejection("EUNSPECIFIED", ec.message()));
                co_return;
            }
            promise.Resolve();
            co_return;
        }

        winrt::hstring srcDirectoryPath, srcFileName;
        splitPath(src, srcDirectoryPath, srcFileName);

        winrt::hstring destDirectoryPath, destFileName;
        splitPath(dest, destDirectoryPath, destFileName);

        StorageFolder srcFolder = co_await StorageFolder::GetFolderFromPathAsync(srcDirectoryPath);
        StorageFolder destFolder = co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath);

        StorageFile file = co_await srcFolder.GetFileAsync(srcFileName);
        co_await file.MoveAsync(destFolder, destFileName, NameCollisionOption::ReplaceExisting);

        promise.Resolve();
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection(ex.code() == HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND) || ex.code() == HRESULT_FROM_WIN32(ERROR_PATH_NOT_FOUND) ? "ENOENT" : "EUNSPECIFIED", winrt::to_string(ex.message())));
    }
}

void ReactNativeBlobUtil::mkdir(
    std::string path,
    ::React::ReactPromise<bool>&& promise) noexcept
{
    try
    {
        std::filesystem::path dirPath(path);
        dirPath.make_preferred();

        if (std::filesystem::exists(dirPath))
        {
            const bool isDirectory = std::filesystem::is_directory(dirPath);
            promise.Reject(rejection("EEXIST", std::string(isDirectory ? "Folder" : "File") + " '" + path + "' already exists"));
            return;
        }
        std::error_code ec;
        bool created = std::filesystem::create_directories(dirPath, ec);
        if (!created && !std::filesystem::exists(dirPath))
        {
            promise.Reject(rejection("EUNSPECIFIED", "mkdir failed to create some or all directories in '" + path + "'"));
        }
        else
        {
            promise.Resolve(true);
        }
    }
    catch (const hresult_error& ex)
    {
        promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EUNSPECIFIED", "Error creating folder " + path + ", error: " + winrt::to_string(ex.message()) });
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::readFile(
    std::string path,
    std::string encoding,
    bool transformFile,
    ::React::ReactPromise<::React::JSValueArray> promise) noexcept
{
    try
    {
        if (IsDirectory(path))
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EISDIR", "EISDIR: illegal operation on a directory, read" });
            co_return;
        }
        winrt::hstring directoryPath, fileName;
        splitPath(path, directoryPath, fileName);

        auto folder = co_await StorageFolder::GetFolderFromPathAsync(directoryPath);
        auto file = co_await folder.GetFileAsync(fileName);
        auto buffer = co_await FileIO::ReadBufferAsync(file);

        ::React::JSValueArray resultArray;
        if (encoding == "base64")
        {
            std::string base64Content = winrt::to_string(Cryptography::CryptographicBuffer::EncodeToBase64String(buffer));
            resultArray.push_back(base64Content);
        }
        else if (encoding == "ascii")
        {
            // ASCII reads return the raw bytes, one number per byte, which is
            // what Android and iOS return and what fs.readFile()'s callers
            // expect. Returning the decoded text made an ascii read
            // indistinguishable from a utf8 one.
            auto reader{ winrt::Windows::Storage::Streams::DataReader::FromBuffer(buffer) };
            std::vector<uint8_t> bytes(reader.UnconsumedBufferLength());
            reader.ReadBytes(bytes);

            for (const auto byte : bytes)
            {
                resultArray.push_back(static_cast<int64_t>(byte));
            }
        }
        else
        {
            const auto bytes{ BytesOf(buffer) };
            resultArray.push_back(DecodeUtf8(bytes.data(), bytes.size()));
        }
        promise.Resolve(resultArray);
    }
    catch (const winrt::hresult_error& ex)
    {
        hresult result{ ex.code() };
        if (result == 0x80070002) // FileNotFoundException
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "ENOENT", "ENOENT: no such file or directory, open " + path });
        }
        else if (result == 0x80070005) // UnauthorizedAccessException
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EISDIR", "EISDIR: illegal operation on a directory, read" });
        }
        else
        {
            // "Failed to read file."
            promise.Reject(winrt::to_string(ex.message()).c_str());
        }
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::hash(
    std::string path,
    std::string algorithm,
    ::React::ReactPromise<std::string> promise) noexcept
{
    try
    {
        // Codes from the ErrorCode union: both of these rejected with the code
        // "Error". WinRT has no SHA-224, so it is a known algorithm this
        // platform lacks.
        if (algorithm.compare("sha224") == 0)
        {
            promise.Reject(rejection("ENOTSUP", "sha224 is not available on Windows"));
            co_return;
        }
        auto search{ availableHashes.find(algorithm) };
        if (search == availableHashes.end())
        {
            promise.Reject(rejection("EINVAL", "Invalid algorithm '" + algorithm + "', must be one of md5, sha1, sha224, sha256, sha384, sha512"));
            co_return;
        }
        if (IsDirectory(path))
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EISDIR", "EISDIR: illegal operation on a directory, read" });
            co_return;
        }

        winrt::hstring directoryPath, fileName;
        splitPath(path, directoryPath, fileName);

        StorageFolder folder{ co_await StorageFolder::GetFolderFromPathAsync(directoryPath) };
        StorageFile file{ co_await folder.GetFileAsync(fileName) };

        CryptographyCore::HashAlgorithmProvider provider{ search->second() };
        Streams::IBuffer buffer{ co_await FileIO::ReadBufferAsync(file) };

        auto hashedBuffer{ provider.HashData(buffer) };
        std::wstring result{ Cryptography::CryptographicBuffer::EncodeToHexString(hashedBuffer) };
        std::string sResult = winrt::to_string(result);
        promise.Resolve(sResult);
    }
    catch (const hresult_error& ex)
    {
        hresult result{ ex.code() };
        if (result == 0x80070002) // FileNotFoundException
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "ENOENT", "ENOENT: no such file or directory, open " + path });
        }
        else if (result == 0x80070005) // UnauthorizedAccessException
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EISDIR", "EISDIR: illegal operation on a directory, read" });
        }
        else
        {
            // "Failed to get checksum from file."
            promise.Reject(winrt::to_string(ex.message()).c_str());
        }
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::readStream(
    std::string path,
    std::string encoding,
    double bufferSize,
    double tick,
    std::string streamId) noexcept
{
    try
    {
        EncodingOptions usedEncoding;
        if (encoding == "utf8")
        {
            usedEncoding = EncodingOptions::UTF8;
        }
        else if (encoding == "base64")
        {
            usedEncoding = EncodingOptions::BASE64;
        }
        else if (encoding == "ascii")
        {
            usedEncoding = EncodingOptions::ASCII;
        }
        else
        {
            m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem",
                winrt::Microsoft::ReactNative::JSValueObject{
                    {"streamId", streamId},
                    {"event", "error"},
                    {"code", "EINVAL"},
                    {"detail", "Unsupported encoding: " + encoding}
                });
            co_return;
        }

        uint32_t chunkSize = (usedEncoding == EncodingOptions::BASE64) ? 4095 : 4096;
        if (bufferSize > 0)
        {
            chunkSize = static_cast<uint32_t>(bufferSize);
        }

        winrt::hstring directoryPath, fileName;
        splitPath(path, directoryPath, fileName);

        StorageFolder folder = co_await StorageFolder::GetFolderFromPathAsync(directoryPath);
        StorageFile file = co_await folder.GetFileAsync(fileName);
        Streams::IRandomAccessStream stream = co_await file.OpenAsync(FileAccessMode::Read);

        Buffer buffer{ chunkSize };
        // The start of a UTF-8 character the chunk read so far ends in; the next
        // chunk finishes it. Each chunk was decoded alone, so a character split
        // between two failed the stream ("No mapping for the Unicode character").
        std::vector<uint8_t> pendingUtf8;

        for (;;)
        {
            auto readBuffer = co_await stream.ReadAsync(buffer, buffer.Capacity(), InputStreamOptions::None);
            if (readBuffer.Length() == 0)
            {
                if (!pendingUtf8.empty())
                {
                    m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem",
                        winrt::Microsoft::ReactNative::JSValueObject{
                            {"streamId", streamId},
                            {"event", "data"},
                            {"detail", DecodeUtf8(pendingUtf8.data(), pendingUtf8.size())}
                        });
                }
                m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem",
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"streamId", streamId},
                        {"event", "end"},
                        {"detail", ""}
                    });
                break;
            }

            if (usedEncoding == EncodingOptions::BASE64)
            {
                winrt::hstring base64Content = Cryptography::CryptographicBuffer::EncodeToBase64String(readBuffer);
                m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem",
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"streamId", streamId},
                        {"event", "data"},
                        {"detail", winrt::to_string(base64Content)}
                    });
            }
            else if (usedEncoding == EncodingOptions::ASCII)
            {
                // One number per byte, the chunk shape Android emits. Masking
                // the decoded text to 7 bits produced a string instead, so an
                // ascii reader on Windows got something no other platform sends.
                auto reader{ winrt::Windows::Storage::Streams::DataReader::FromBuffer(readBuffer) };
                std::vector<uint8_t> bytes(reader.UnconsumedBufferLength());
                reader.ReadBytes(bytes);

                winrt::Microsoft::ReactNative::JSValueArray chunk;
                for (const auto byte : bytes)
                {
                    chunk.push_back(static_cast<int64_t>(byte));
                }

                winrt::Microsoft::ReactNative::JSValueObject payload;
                payload["streamId"] = streamId;
                payload["event"] = "data";
                payload["detail"] = std::move(chunk);

                m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem", std::move(payload));
            }
            else
            {
                auto bytes{ BytesOf(readBuffer) };
                bytes.insert(bytes.begin(), pendingUtf8.begin(), pendingUtf8.end());
                const size_t complete{ CompleteUtf8Length(bytes) };
                pendingUtf8.assign(bytes.begin() + complete, bytes.end());
                if (complete > 0)
                {
                    m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem",
                        winrt::Microsoft::ReactNative::JSValueObject{
                            {"streamId", streamId},
                            {"event", "data"},
                            {"detail", DecodeUtf8(bytes.data(), complete)}
                        });
                }
            }

            if (tick > 0)
            {
                std::this_thread::sleep_for(std::chrono::milliseconds(static_cast<int64_t>(tick)));
            }
        }
    }
    catch (const hresult_error& ex)
    {
        const bool notFound = ex.code() == HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND); // 0x80070002

        m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem",
            winrt::Microsoft::ReactNative::JSValueObject{
                {"streamId", streamId},
                {"event", "error"},
                {"code", notFound ? "ENOENT" : "EUNSPECIFIED"},
                {"detail", notFound ? "No such file: " + path : winrt::to_string(ex.message())}
            });
    }
}

void ReactNativeBlobUtil::RequestStarted(std::string const& taskId) noexcept
{
    std::scoped_lock lock{ m_requestsMutex };
    m_startedRequests.insert(taskId);
}

void ReactNativeBlobUtil::RequestEnded(std::string const& taskId) noexcept
{
    std::scoped_lock lock{ m_requestsMutex };
    m_startedRequests.erase(taskId);
    m_cancelledRequests.erase(taskId);
    m_sendingRequests.erase(taskId);
}

bool ReactNativeBlobUtil::RequestCancelled(std::string const& taskId) noexcept
{
    std::scoped_lock lock{ m_requestsMutex };
    return m_cancelledRequests.count(taskId) > 0;
}

bool ReactNativeBlobUtil::RequestSending(std::string const& taskId, winrt::Windows::Foundation::IAsyncInfo const& operation) noexcept
{
    std::scoped_lock lock{ m_requestsMutex };
    if (m_cancelledRequests.count(taskId) > 0)
    {
        return false;
    }
    m_sendingRequests.insert_or_assign(taskId, operation);
    return true;
}

void ReactNativeBlobUtil::RequestSent(std::string const& taskId) noexcept
{
    std::scoped_lock lock{ m_requestsMutex };
    m_sendingRequests.erase(taskId);
}

void ReactNativeBlobUtil::cancelRequest(
    std::string taskId,
    ::React::ReactPromise<void>&& promise) noexcept
{
    try
    {
        // Nothing registered the requests with m_tasks since the move to the new
        // architecture, so cancel() stopped nothing on Windows.
        winrt::Windows::Foundation::IAsyncInfo operation{ nullptr };
        {
            std::scoped_lock lock{ m_requestsMutex };
            if (auto found{ m_sendingRequests.find(taskId) }; found != m_sendingRequests.end())
            {
                operation = found->second;
            }
            if (m_startedRequests.count(taskId) > 0)
            {
                m_cancelledRequests.insert(taskId);
            }
        }
        if (operation)
        {
            operation.Cancel();
        }
        m_tasks.Cancel(taskId);
        {
            std::scoped_lock lock{ m_backgroundMutex };
            if (m_backgroundStarting.count(taskId) > 0)
            {
                m_backgroundForgotten.insert(taskId);
            }
        }
        if (ReadBackgroundRecord(taskId))
        {
            ForgetBackground(taskId);
        }
        promise.Resolve();
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
    }
}

void ReactNativeBlobUtil::enableProgressReport(
    std::string taskId,
    double interval,
    double count) noexcept
{
    ReactNativeBlobUtilProgressConfig config{ count, interval };
	std::scoped_lock lock{ m_mutex };
	downloadProgressMap.try_emplace(taskId, config);
}

void ReactNativeBlobUtil::enableUploadProgressReport(
    std::string taskId,
    double interval,
    double count) noexcept
{
	ReactNativeBlobUtilProgressConfig config{ count, interval };
	std::scoped_lock lock{ m_mutex };
	uploadProgressMap.try_emplace(taskId, config);
}

winrt::fire_and_forget ReactNativeBlobUtil::slice(
    std::string src,
    std::string dest,
    double start,
    double end,
    ::React::ReactPromise<std::string> promise) noexcept
{
    try
    {
        if (!std::filesystem::exists(src))
        {
            promise.Reject(rejection("ENOENT", "No such file '" + src + "'"));
            co_return;
        }
        if (std::filesystem::is_directory(src))
        {
            promise.Reject(rejection("EISDIR", "Expecting a file but '" + src + "' is a directory"));
            co_return;
        }

        // The destination was split from the source path, so the slice was
        // written back into the source file. Split the destination.
        winrt::hstring destDirectoryPath, destFileName;
        splitPath(dest, destDirectoryPath, destFileName);
        std::error_code directoryError;
        std::filesystem::create_directories(std::filesystem::path{ dest }.parent_path(), directoryError);
        StorageFolder destFolder{ co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath) };
        StorageFile destFile{ co_await destFolder.CreateFileAsync(destFileName, CreationCollisionOption::ReplaceExisting) };

        StorageFile srcFile{ co_await StorageFile::GetFileFromPathAsync(nativePath(src)) };
        Streams::IRandomAccessStream stream{ co_await srcFile.OpenAsync(FileAccessMode::Read) };
        uint64_t size = stream.Size();
        uint64_t uStart = std::min(static_cast<uint64_t>(std::max(start, 0.0)), size);
        uint64_t uEnd = std::min(static_cast<uint64_t>(std::max(end, 0.0)), size);
        uint32_t length = static_cast<uint32_t>(uEnd > uStart ? uEnd - uStart : 0);

        // An empty range is an empty file, as on Android and iOS.
        Streams::Buffer buffer{ length };
        if (length > 0)
        {
            stream.Seek(uStart);
            // ReadAsync was not awaited before: the file was written from an
            // empty buffer.
            co_await stream.ReadAsync(buffer, length, Streams::InputStreamOptions::None);
        }
        co_await FileIO::WriteBufferAsync(destFile, buffer);

        promise.Resolve(dest);
    }
    catch (const winrt::hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", "Unable to slice file: " + winrt::to_string(ex.message())));
    }
    catch (...)
    {
        promise.Reject(rejection("EUNSPECIFIED", "Unable to slice file"));
    }
}

IAsyncAction setTimeout(std::chrono::seconds time) {
	co_await time;
}

void ReactNativeBlobUtil::presentOptionsMenu(
    std::string uri,
    std::optional<std::string> scheme,
    ::React::ReactPromise<::React::JSValueArray>&& result) noexcept
{
    result.Resolve(::React::JSValueArray{});
}

void ReactNativeBlobUtil::presentOpenInMenu(
    std::string uri,
    std::optional<std::string> scheme,
    ::React::ReactPromise<::React::JSValueArray>&& result) noexcept
{
    result.Resolve(::React::JSValueArray{});
}

void ReactNativeBlobUtil::presentPreview(
    std::string uri,
    std::optional<std::string> scheme,
    ::React::ReactPromise<::React::JSValueArray>&& result) noexcept
{
    result.Resolve(::React::JSValueArray{});
}

void ReactNativeBlobUtil::excludeFromBackupKey(
    std::string url,
    ::React::ReactPromise<::React::JSValueArray>&& result) noexcept
{
    result.Resolve(::React::JSValueArray{});
}

winrt::fire_and_forget ReactNativeBlobUtil::df(
    ::React::ReactPromise<::React::JSValue> promise) noexcept
{ 
        try
        {
            auto localFolder = winrt::Windows::Storage::ApplicationData::Current().LocalFolder();
            auto properties{ co_await localFolder.Properties().RetrievePropertiesAsync({L"System.FreeSpace", L"System.Capacity"}) };

            winrt::Microsoft::ReactNative::JSValueObject result;
            result["free"] = winrt::unbox_value<uint64_t>(properties.Lookup(L"System.FreeSpace"));
            result["total"] = winrt::unbox_value<uint64_t>(properties.Lookup(L"System.Capacity"));

            promise.Resolve(::React::JSValue{ std::move(result) });
        }
        catch (...)
        {
            promise.Reject(rejection("EUNSPECIFIED", "Failed to get storage usage."));
        }
   
}

void ReactNativeBlobUtil::actionViewIntent(
    std::string path,
    std::string mime,
    std::optional<std::string> chooserTitle,
    ::React::ReactPromise<void>&& result) noexcept
{
    // No-op: Android API
    result.Resolve();
}

void ReactNativeBlobUtil::addCompleteDownload(
    ::React::JSValue&& config,
    ::React::ReactPromise<void>&& result) noexcept
{
    // No-op: Android API
    result.Resolve();
}

void ReactNativeBlobUtil::copyToInternal(
    std::string contentUri,
    std::string destpath,
    ::React::JSValue&& options,
    ::React::ReactPromise<std::string>&& result) noexcept
{
    // JS rejects ENOTSUP before reaching native; this covers a direct call.
    result.Reject(rejection("ENOTSUP", "ReactNativeBlobUtil.media.copyToInternal is only available on Android and iOS"));
}

void ReactNativeBlobUtil::copyToMediaStore(
    ::React::JSValue&& filedata,
    std::string mt,
    std::string path,
    ::React::ReactPromise<std::string>&& result) noexcept
{
    // No-op: Android API
    result.Resolve("");
}

void ReactNativeBlobUtil::createMediaFile(
    ::React::JSValue&& filedata,
    std::string mt,
    ::React::ReactPromise<std::string>&& result) noexcept
{
    // No-op: Android API
    result.Resolve("");
}

void ReactNativeBlobUtil::getBlob(
    std::string contentUri,
    std::string encoding,
    ::React::ReactPromise<::React::JSValueArray>&& result) noexcept
{
    // No-op: Android API
    result.Resolve(::React::JSValueArray{});
}

void ReactNativeBlobUtil::readRange(
    std::string path,
    double position,
    double length,
    ::React::ReactPromise<std::string>&& promise) noexcept
{
    try
    {
        std::filesystem::path target{ nativePath(path).c_str() };
        std::error_code ec;
        if (std::filesystem::is_directory(target, ec))
        {
            promise.Reject(rejection("EISDIR", "Expecting a file but '" + path + "' is a directory"));
            return;
        }
        if (!std::filesystem::exists(target, ec))
        {
            promise.Reject(rejection("ENOENT", "No such file '" + path + "'"));
            return;
        }
        const uint64_t size{ std::filesystem::file_size(target, ec) };
        const uint64_t start{ static_cast<uint64_t>(position) };
        if (ec || start >= size)
        {
            promise.Resolve(std::string{});
            return;
        }
        const uint64_t available{ size - start };
        const uint64_t count{ length < 0 ? available : std::min<uint64_t>(static_cast<uint64_t>(length), available) };
        std::vector<uint8_t> bytes(static_cast<size_t>(count));
        std::ifstream input{ target, std::ios::binary };
        input.seekg(static_cast<std::streamoff>(start));
        input.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(count));
        if (!input && !input.eof())
        {
            promise.Reject(rejection("EUNSPECIFIED", "Could not read '" + path + "'"));
            return;
        }
        bytes.resize(static_cast<size_t>(input.gcount()));
        promise.Resolve(EncodeBase64(bytes));
    }
    catch (const hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
    }
    catch (const std::exception& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", ex.what()));
    }
}

void ReactNativeBlobUtil::writeRange(
    std::string path,
    std::string data,
    double position,
    ::React::ReactPromise<double>&& promise) noexcept
{
    try
    {
        // Decoded first: bad data leaves the file as it was.
        auto decoded{ DecodeBase64ForFile(data) };
        if (!decoded)
        {
            promise.Reject(rejection("EINVAL", "Invalid base64 data"));
            return;
        }
        std::vector<uint8_t> bytes;
        if (decoded->Length() > 0)
        {
            winrt::com_array<uint8_t> raw;
            CryptographicBuffer::CopyToByteArray(*decoded, raw);
            bytes.assign(raw.begin(), raw.end());
        }

        std::filesystem::path target{ nativePath(path).c_str() };
        std::error_code ec;
        if (std::filesystem::is_directory(target, ec))
        {
            promise.Reject(rejection("EISDIR", "Expecting a file but '" + path + "' is a directory"));
            return;
        }
        if (!std::filesystem::is_directory(target.parent_path(), ec))
        {
            promise.Reject(rejection("ENOENT", "Directory of '" + path + "' does not exist"));
            return;
        }
        if (!std::filesystem::exists(target, ec))
        {
            std::ofstream create{ target, std::ios::binary };
            if (!create)
            {
                promise.Reject(rejection("EUNSPECIFIED", "Could not create '" + path + "'"));
                return;
            }
        }
        const uint64_t length{ std::filesystem::file_size(target, ec) };
        const uint64_t start{ position < 0 ? length : static_cast<uint64_t>(position) };
        std::fstream file{ target, std::ios::binary | std::ios::in | std::ios::out };
        if (!file)
        {
            promise.Reject(rejection("EUNSPECIFIED", "Could not open '" + path + "'"));
            return;
        }
        // A gap past the end is filled with zeros, written rather than left to the file system.
        if (start > length)
        {
            file.seekp(static_cast<std::streamoff>(length));
            const std::vector<char> zeros(static_cast<size_t>(std::min<uint64_t>(65536, start - length)), 0);
            for (uint64_t gap{ start - length }; gap > 0;)
            {
                const auto step{ std::min<uint64_t>(gap, zeros.size()) };
                file.write(zeros.data(), static_cast<std::streamsize>(step));
                gap -= step;
            }
        }
        file.seekp(static_cast<std::streamoff>(start));
        file.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
        file.flush();
        if (!file)
        {
            promise.Reject(rejection("EUNSPECIFIED", "Could not write '" + path + "'"));
            return;
        }
        promise.Resolve(static_cast<double>(bytes.size()));
    }
    catch (const hresult_error& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
    }
    catch (const std::exception& ex)
    {
        promise.Reject(rejection("EUNSPECIFIED", ex.what()));
    }
}

void ReactNativeBlobUtil::touch(
    std::string path,
    double mtime,
    double ctime,
    ::React::ReactPromise<void>&& promise) noexcept
{
    std::filesystem::path target{ nativePath(path).c_str() };
    std::error_code ec;
    const bool directory{ std::filesystem::is_directory(target, ec) };
    if (!directory && !std::filesystem::is_directory(target.parent_path(), ec))
    {
        promise.Reject(rejection("ENOENT", "Directory of '" + path + "' does not exist"));
        return;
    }
    CREATEFILE2_EXTENDED_PARAMETERS parameters{};
    parameters.dwSize = sizeof(parameters);
    parameters.dwFileAttributes = FILE_ATTRIBUTE_NORMAL;
    // Needed to open a directory at all.
    parameters.dwFileFlags = FILE_FLAG_BACKUP_SEMANTICS;
    // OPEN_ALWAYS creates a missing file empty, as touch does.
    HANDLE handle{ CreateFile2(target.c_str(), FILE_WRITE_ATTRIBUTES | (directory ? 0 : GENERIC_WRITE),
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, directory ? OPEN_EXISTING : OPEN_ALWAYS, &parameters) };
    if (handle == INVALID_HANDLE_VALUE)
    {
        const DWORD error{ GetLastError() };
        promise.Reject(rejection(error == ERROR_PATH_NOT_FOUND || error == ERROR_FILE_NOT_FOUND ? "ENOENT"
            : error == ERROR_ACCESS_DENIED ? "EACCES" : "EUNSPECIFIED", "Could not open '" + path + "'"));
        return;
    }
    // Zero leaves a time as it is.
    FILE_BASIC_INFO info{};
    info.LastWriteTime = FileTimeOfMillis(mtime);
    if (ctime >= 0)
    {
        info.CreationTime = FileTimeOfMillis(ctime);
    }
    const BOOL set{ SetFileInformationByHandle(handle, FileBasicInfo, &info, sizeof(info)) };
    CloseHandle(handle);
    if (!set)
    {
        promise.Reject(rejection("EUNSPECIFIED", "Could not set the times of '" + path + "'"));
        return;
    }
    promise.Resolve();
}

void ReactNativeBlobUtil::setAttributes(
    std::string path,
    ::React::JSValue&& attributes,
    ::React::ReactPromise<void>&& promise) noexcept
{
    promise.Reject(rejection("ENOTSUP", "ReactNativeBlobUtil.fs.setAttributes is only available on iOS"));
}

void ReactNativeBlobUtil::bundlePath(
    std::string name,
    ::React::ReactPromise<std::string>&& promise) noexcept
{
    promise.Reject(rejection("ENOTSUP", "ReactNativeBlobUtil.fs.bundlePath is only available on iOS"));
}

void ReactNativeBlobUtil::getExternalDirs(
    ::React::ReactPromise<::React::JSValueArray>&& promise) noexcept
{
    // No external storage volumes of the app's own on Windows.
    promise.Resolve(::React::JSValueArray{});
}

void ReactNativeBlobUtil::pickFiles(
    ::React::JSValue&& options,
    ::React::ReactPromise<::React::JSValueArray>&& promise) noexcept
{
    bool expected{ false };
    if (!m_pickerOpen.compare_exchange_strong(expected, true))
    {
        promise.Reject(rejection("EBUSY", "A file picker is already open"));
        return;
    }
    // JS sends the extensions for the MIME types; the picker filters by them.
    std::vector<winrt::hstring> extensions;
    bool multiple{ false };
    if (options.Type() == ::React::JSValueType::Object)
    {
        auto const& object{ options.AsObject() };
        auto const found{ object.find("extensions") };
        if (found != object.end() && found->second.Type() == ::React::JSValueType::Array)
        {
            for (auto const& extension : found->second.AsArray())
            {
                extensions.push_back(winrt::to_hstring(extension.AsString()));
            }
        }
        auto const many{ object.find("multiple") };
        multiple = many != object.end() && many->second.AsBoolean();
    }
    if (extensions.empty())
    {
        extensions.push_back(L"*");
    }

    // The picker is shown from the UI thread, owned by the app's window.
    auto context{ m_context };
    context.UIDispatcher().Post([this, context, extensions, multiple, promise]() mutable
    {
        [](ReactNativeBlobUtil* self, React::ReactContext context, std::vector<winrt::hstring> extensions, bool multiple,
            ::React::ReactPromise<::React::JSValueArray> promise) -> winrt::fire_and_forget
        {
            ::React::JSValueArray picked;
            try
            {
                winrt::Windows::Storage::Pickers::FileOpenPicker picker;
                const auto windowId{ winrt::Microsoft::ReactNative::ReactCoreInjection::GetTopLevelWindowId(context.Properties().Handle()) };
                if (windowId != 0)
                {
                    picker.as<::IInitializeWithWindow>()->Initialize(reinterpret_cast<HWND>(windowId));
                }
                for (auto const& extension : extensions)
                {
                    picker.FileTypeFilter().Append(extension);
                }
                std::vector<StorageFile> files;
                if (multiple)
                {
                    for (auto const& file : co_await picker.PickMultipleFilesAsync())
                    {
                        files.push_back(file);
                    }
                }
                else if (auto file{ co_await picker.PickSingleFileAsync() })
                {
                    files.push_back(file);
                }
                // A copy the app owns, as on iOS: a picked file outside the app's
                // folders cannot be opened by path later.
                auto temporary{ ApplicationData::Current().TemporaryFolder() };
                for (auto const& file : files)
                {
                    auto copy{ co_await file.CopyAsync(temporary, file.Name(), NameCollisionOption::GenerateUniqueName) };
                    picked.push_back(::React::JSValue{ winrt::to_string(copy.Path()) });
                }
                self->m_pickerOpen = false;
                promise.Resolve(std::move(picked));
            }
            catch (const hresult_error& ex)
            {
                self->m_pickerOpen = false;
                promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
            }
        }(this, context, extensions, multiple, promise);
    });
}

void ReactNativeBlobUtil::getSDCardDir(
    ::React::ReactPromise<std::string>&& result) noexcept
{
    // No-op: Android API
    result.Resolve("");
}

void ReactNativeBlobUtil::getSDCardApplicationDir(
    ::React::ReactPromise<std::string>&& result) noexcept
{
    // No-op: Android API
    result.Resolve("");
}

void ReactNativeBlobUtil::scanFile(
    ::React::JSValueArray&& pairs,
    ::React::ReactPromise<void>&& promise) noexcept
{
    // Android API; JavaScript rejects with ENOTSUP before reaching here.
    promise.Reject(rejection("ENOTSUP", "scanFile is only available on Android"));
}

void ReactNativeBlobUtil::writeToMediaFile(
    std::string fileUri,
    std::string path,
    bool transformFile,
    ::React::ReactPromise<std::string>&& result) noexcept
{
    // No-op: Android API
    result.Resolve("");
}

void ReactNativeBlobUtil::addListener(
    std::string eventName) noexcept
{
    // No-op
}

void ReactNativeBlobUtil::removeListeners(
    double count) noexcept
{
    // No-op
}

void ReactNativeBlobUtil::splitPath(const std::string& fullPath, winrt::hstring& directoryPath, winrt::hstring& fileName) noexcept
{
	std::filesystem::path path{ fullPath };
	path.make_preferred();

	directoryPath = path.has_parent_path() ? winrt::to_hstring(path.parent_path().c_str()) : L"";
	fileName = path.has_filename() ? winrt::to_hstring(path.filename().c_str()) : L"";
}

void ReactNativeBlobUtil::splitPath(const std::wstring& fullPath, winrt::hstring& directoryPath, winrt::hstring& fileName) noexcept
{
	std::filesystem::path path{ fullPath };
	path.make_preferred();

	directoryPath = path.has_parent_path() ? winrt::to_hstring(path.parent_path().c_str()) : L"";
	fileName = path.has_filename() ? winrt::to_hstring(path.filename().c_str()) : L"";
}

winrt::Windows::Foundation::IAsyncAction ReactNativeBlobUtil::ProcessRequestAsync(
	const std::string& taskId,
	const winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter& filter,
	winrt::Windows::Web::Http::HttpRequestMessage& httpRequestMessage,
	ReactNativeBlobUtilConfig& config,
	std::function<void(std::string, std::string, std::string)> callback,
	std::string& error) noexcept
try
{
	winrt::Windows::Web::Http::HttpClient httpClient{filter};

	winrt::Windows::Web::Http::HttpResponseMessage response{ co_await httpClient.SendRequestAsync(httpRequestMessage, winrt::Windows::Web::Http::HttpCompletionOption::ResponseHeadersRead) };
	
	ReactNativeBlobUtilState eventState;

	auto status{ static_cast<int>(response.StatusCode()) };
	if (config.followRedirect) {
		while (status >= 300 && status < 400) {
			auto redirect{ response.Headers().Location().ToString() };
			eventState.redirects.push_back(Microsoft::ReactNative::JSValue(winrt::to_string(redirect)));
			httpRequestMessage.RequestUri(Uri{ redirect });
			response = co_await httpClient.SendRequestAsync(httpRequestMessage, winrt::Windows::Web::Http::HttpCompletionOption::ResponseHeadersRead);
			status = static_cast<int>(response.StatusCode());
		}
	}
	
	eventState.status = static_cast<int>(response.StatusCode());

	for (const auto header : response.Content().Headers().GetView()) {
		eventState.headers[winrt::to_string(header.Key())] = winrt::to_string(header.Value());
	}

	if (response.Content().Headers().ContentType() != nullptr) {
		eventState.respType = winrt::to_string(response.Content().Headers().ContentType().ToString());
	}

	eventState.state = winrt::to_string(response.ReasonPhrase());

	m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilState",
		Microsoft::ReactNative::JSValueObject{
			{ "taskId", taskId },
			{ "state", eventState.state },
			{ "headers", std::move(eventState.headers) },
			{ "redirects", std::move(eventState.redirects) },
			{ "respType", eventState.respType },
			{ "status", eventState.status },
			{ "timeout", false },
		});

	IReference<uint64_t> contentLength{ response.Content().Headers().ContentLength() };

	IOutputStream outputStream;
	bool writeToFile{ config.fileCache || !config.path.empty() };

	if (writeToFile)
	{
		if (config.path.empty())
		{
			config.path = winrt::to_string(ApplicationData::Current().TemporaryFolder().Path()) + "\\ReactNativeBlobUtilTmp_" + taskId;
			if (config.appendExt.length() > 0)
			{
				config.path += "." + config.appendExt;
			}
		}
		std::filesystem::path path{ config.path };
		StorageFolder storageFolder{ co_await StorageFolder::GetFolderFromPathAsync( path.parent_path().wstring()) };
		StorageFile storageFile{ co_await storageFolder.CreateFileAsync(path.filename().wstring(), CreationCollisionOption::FailIfExists) };
		IRandomAccessStream stream{ co_await storageFile.OpenAsync(FileAccessMode::ReadWrite) };
		outputStream = stream.GetOutputStreamAt(0) ;
	}

	auto contentStream{ co_await response.Content().ReadAsInputStreamAsync() };
	Buffer buffer{ 10 * 1024 };
	uint64_t read{ 0 };
	uint64_t totalRead{ 0 };

	ReactNativeBlobUtilProgressConfig progressInfo;
	uint64_t progressInterval{ 0 };

	std::stringstream chunkStream;
	std::stringstream resultOutput;

	std::string readContents{""};

	auto exists{ downloadProgressMap.find(taskId) };
	if (exists != downloadProgressMap.end() && contentLength.Type() == PropertyType::UInt64) {
		progressInfo = downloadProgressMap[taskId];

		if (progressInfo.count > -1) {
			progressInterval = contentLength.Value() / 100 * progressInfo.count;
		}
	}

	int64_t initialProgressTime{ winrt::clock::now().time_since_epoch().count() / 10000 };
	int64_t currentProgressTime;

	for (;;)
	{
		buffer.Length(0);
		auto readBuffer{ co_await contentStream.ReadAsync(buffer, buffer.Capacity(), InputStreamOptions::None) };

		read += readBuffer.Length();
		totalRead += read;

		if (readBuffer.Length() == 0)
		{
			break;
		}
		
		readContents = winrt::to_string(CryptographicBuffer::EncodeToBase64String(readBuffer));

		if (writeToFile) {
			co_await outputStream.WriteAsync(readBuffer);
		}
		else {
			resultOutput << readContents;
		}

		if (progressInfo.count > -1 || progressInfo.interval > -1) {
			chunkStream << readContents;

			currentProgressTime = winrt::clock::now().time_since_epoch().count() / 10000;
			if ((currentProgressTime - initialProgressTime >= progressInfo.interval && progressInfo.interval > -1) ||
				(totalRead >= progressInterval && progressInfo.count > -1)) {
				m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilProgress",
					Microsoft::ReactNative::JSValueObject{
						{ "taskId", taskId },
						{ "written", int64_t(totalRead) },
						{ "total", contentLength.Type() == PropertyType::UInt64 ?
									Microsoft::ReactNative::JSValue(contentLength.Value()) :
									Microsoft::ReactNative::JSValue{nullptr} },
						{ "chunk", chunkStream.str() },
					});
				chunkStream.clear();
				initialProgressTime = winrt::clock::now().time_since_epoch().count() / 10000;
				if (progressInfo.count > -1) {
					read = 0;
				}
			}
		}
	}

	if (writeToFile) {
		callback("", "path", config.path);
	}
	else {
		callback("", "result", resultOutput.str());
	}
}
catch (const hresult_error& ex)
{
	error = winrt::to_string(ex.message().c_str());
	//callback(winrt::to_string(ex.message().c_str()), "error", "");
}
catch (...) {
	co_return;
}


// ---------------------------------------------------------------------------
// Downloads that outlive the app (config({path, background: {id}})), run by
// BITS, the Background Intelligent Transfer Service: a system service that
// downloads for the user while the app is suspended or closed, across
// restarts. BackgroundDownloader only works in an app container, which a React
// Native for Windows app is not. BITS writes the file at its path once the job
// is completed. A record per id, in LocalSettings, holds the job's GUID; it
// stays until the outcome has been handed to JS (the fetch that started it, or
// background.attach) or until background.forget.

namespace
{
    winrt::com_ptr<IBackgroundCopyManager> BitsManager()
    {
        winrt::com_ptr<IBackgroundCopyManager> manager;
        winrt::check_hresult(CoCreateInstance(__uuidof(BackgroundCopyManager), nullptr, CLSCTX_LOCAL_SERVER,
            __uuidof(IBackgroundCopyManager), manager.put_void()));
        return manager;
    }

    std::optional<GUID> GuidOf(std::string const& text)
    {
        GUID guid{};
        if (FAILED(CLSIDFromString(winrt::to_hstring(text).c_str(), &guid)))
        {
            return std::nullopt;
        }
        return guid;
    }

    std::string TextOfGuid(GUID const& guid)
    {
        wchar_t text[64]{};
        StringFromGUID2(guid, text, 64);
        return winrt::to_string(text);
    }

    winrt::com_ptr<IBackgroundCopyJob> BitsJob(std::string const& guidText)
    {
        const auto guid{ GuidOf(guidText) };
        if (!guid)
        {
            return nullptr;
        }
        winrt::com_ptr<IBackgroundCopyJob> job;
        if (FAILED(BitsManager()->GetJob(*guid, job.put())))
        {
            return nullptr;
        }
        return job;
    }

    // Why a BITS job failed, in its own words.
    std::string BitsError(winrt::com_ptr<IBackgroundCopyJob> const& job)
    {
        winrt::com_ptr<IBackgroundCopyError> error;
        if (FAILED(job->GetError(error.put())) || !error)
        {
            return "The background download failed";
        }
        LPWSTR description{ nullptr };
        std::string text{ "The background download failed" };
        if (SUCCEEDED(error->GetErrorDescription(GetUserDefaultLangID(), &description)) && description)
        {
            text = winrt::to_string(description);
            CoTaskMemFree(description);
            while (!text.empty() && (text.back() == '\n' || text.back() == '\r' || text.back() == ' '))
            {
                text.pop_back();
            }
        }
        return text;
    }
}

void ReactNativeBlobUtil::StartBackgroundDownload(std::string id, std::string url, std::string path, ::React::JSValue headers, FetchCallback callback) noexcept
{
    [](ReactNativeBlobUtil* self, std::string id, std::string url, std::string path, ::React::JSValue headers, FetchCallback callback) -> winrt::fire_and_forget
    {
        co_await winrt::resume_background();
        try
        {
            if (path.empty())
            {
                self->BackgroundStartEnded(id, false);
                callback(fetchError("EINVAL", "A background download needs a path"), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }
            winrt::Windows::Foundation::Uri uri{ nullptr };
            if (!TryParseRequestUri(url, uri))
            {
                self->BackgroundStartEnded(id, false);
                callback(fetchError("EINVAL", "Invalid URL: " + url), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }
            // BITS also downloads file:// and UNC names, over SMB, signing in to
            // the host they name as the user. JS refuses them (utils/background.js);
            // checked again here, where the job is made.
            if (uri.SchemeName() != L"http" && uri.SchemeName() != L"https")
            {
                self->BackgroundStartEnded(id, false);
                callback(fetchError("EINVAL", "A background download needs an http or https URL"), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }
            const std::filesystem::path target{ std::filesystem::path{ path }.make_preferred() };
            std::error_code ec;
            std::filesystem::create_directories(target.parent_path(), ec);

            GUID guid{};
            winrt::com_ptr<IBackgroundCopyJob> job;
            winrt::check_hresult(BitsManager()->CreateJob(winrt::to_hstring("react-native-blob-util " + id).c_str(), BG_JOB_TYPE_DOWNLOAD, &guid, job.put()));
            std::wstring custom;
            if (headers.Type() == ::React::JSValueType::Object)
            {
                for (auto const& [name, value] : headers.AsObject())
                {
                    if (_stricmp(name.c_str(), "RNFB-Response") != 0)
                    {
                        custom += winrt::to_hstring(name + ": " + value.AsString()) + L"\r\n";
                    }
                }
            }
            if (!custom.empty())
            {
                if (auto options{ job.try_as<IBackgroundCopyJobHttpOptions>() })
                {
                    winrt::check_hresult(options->SetCustomHeaders(custom.c_str()));
                }
            }
            winrt::check_hresult(job->AddFile(winrt::to_hstring(url).c_str(), target.c_str()));
            winrt::check_hresult(job->Resume());

            WriteBackgroundRecord(BackgroundRecord{ id, url, path, TextOfGuid(guid), "running" });
            {
                std::scoped_lock lock{ self->m_backgroundMutex };
                self->m_backgroundCallbacks.insert_or_assign(id, callback);
            }
            self->BackgroundStartEnded(id, true);
        }
        catch (const hresult_error& ex)
        {
            self->BackgroundStartEnded(id, false);
            callback(fetchError("EUNSPECIFIED", "Could not start the background download: " + winrt::to_string(ex.message())), std::nullopt, std::nullopt, std::nullopt);
        }
    }(this, std::move(id), std::move(url), std::move(path), std::move(headers), std::move(callback));
}

// Asks BITS about a download that is not finished and acts on the answer: a
// transferred job is completed (BITS then moves the file to its path), a failed
// one cancelled. Returns the record as it now is.
BackgroundRecord ReactNativeBlobUtil::RefreshBackgroundRecord(BackgroundRecord record) noexcept
{
    // Finished, or still being started (no job yet).
    if (record.Finished() || record.guid.empty())
    {
        return record;
    }
    try
    {
        auto job{ BitsJob(record.guid) };
        if (!job)
        {
            record.state = "failed";
            record.errorCode = "EUNSPECIFIED";
            record.errorMessage = "The system no longer knows this background download";
        }
        else
        {
            BG_JOB_STATE state{};
            winrt::check_hresult(job->GetState(&state));
            BG_JOB_PROGRESS progress{};
            if (SUCCEEDED(job->GetProgress(&progress)))
            {
                record.written = static_cast<int64_t>(progress.BytesTransferred);
                record.total = progress.BytesTotal == BG_SIZE_UNKNOWN ? -1 : static_cast<int64_t>(progress.BytesTotal);
            }
            switch (state)
            {
            case BG_JOB_STATE_TRANSFERRED:
            {
                const std::filesystem::path target{ std::filesystem::path{ record.path }.make_preferred() };
                HRESULT completed{ job->Complete() };
                if (FAILED(completed))
                {
                    // A file already there: replaced, as any download to a path replaces it.
                    std::error_code ec;
                    std::filesystem::remove(target, ec);
                    completed = job->Complete();
                }
                if (FAILED(completed))
                {
                    record.state = "failed";
                    record.errorCode = "EUNSPECIFIED";
                    record.errorMessage = "Could not put the download at '" + record.path + "'";
                }
                else
                {
                    record.state = "completed";
                    record.total = record.written;
                }
                break;
            }
            case BG_JOB_STATE_ACKNOWLEDGED:
                record.state = "completed";
                record.total = record.written;
                break;
            case BG_JOB_STATE_ERROR:
                record.state = "failed";
                record.errorCode = "EUNSPECIFIED";
                record.errorMessage = BitsError(job);
                job->Cancel();
                break;
            case BG_JOB_STATE_CANCELLED:
                record.state = "failed";
                record.errorCode = "ECANCELED";
                record.errorMessage = "The background download was cancelled";
                break;
            case BG_JOB_STATE_SUSPENDED:
                record.state = "paused";
                break;
            default:
                // Queued, connecting, transferring, or a transient error BITS retries.
                record.state = "running";
                break;
            }
        }
    }
    catch (const hresult_error& ex)
    {
        record.state = "failed";
        record.errorCode = "EUNSPECIFIED";
        record.errorMessage = winrt::to_string(ex.message());
    }
    if (ReadBackgroundRecord(record.id))
    {
        WriteBackgroundRecord(record);
    }
    return record;
}

// Follows a background download while the app runs: progress, and its outcome
// to the task waiting for it.
void ReactNativeBlobUtil::WatchBackgroundDownload(std::string id) noexcept
{
    {
        std::scoped_lock lock{ m_backgroundMutex };
        if (!m_watchedBackground.insert(id).second)
        {
            return;
        }
    }
    [](ReactNativeBlobUtil* self, std::string id) -> winrt::fire_and_forget
    {
        ProgressThrottle throttle;
        for (;;)
        {
            co_await winrt::resume_after(std::chrono::milliseconds{ 400 });
            auto stored{ ReadBackgroundRecord(id) };
            if (!stored)
            {
                break; // forgotten
            }
            const auto record{ self->RefreshBackgroundRecord(*stored) };
            if (record.state == "running" && record.written > 0)
            {
                self->ReportDownloadProgress(id, static_cast<uint64_t>(record.written), record.total, throttle);
            }
            if (record.Finished())
            {
                if (record.state == "completed")
                {
                    self->ReportDownloadProgress(id, static_cast<uint64_t>(record.written), record.written, throttle);
                }
                self->DeliverBackground(record);
                break;
            }
        }
        std::scoped_lock lock{ self->m_backgroundMutex };
        self->m_watchedBackground.erase(id);
    }(this, std::move(id));
}

void ReactNativeBlobUtil::DeliverBackground(BackgroundRecord const& record) noexcept
{
    FetchCallback callback;
    {
        std::scoped_lock lock{ m_backgroundMutex };
        const auto found{ m_backgroundCallbacks.find(record.id) };
        if (found == m_backgroundCallbacks.end())
        {
            return;
        }
        callback = found->second;
        m_backgroundCallbacks.erase(found);
    }
    // Handed over: the record goes.
    RemoveBackgroundRecord(record.id);
    if (record.state == "completed")
    {
        callback(std::nullopt, "path", record.path, ::React::JSValue{ BackgroundInfo(record) });
    }
    else
    {
        callback(fetchError(record.errorCode.empty() ? "EUNSPECIFIED" : record.errorCode, record.errorMessage), std::nullopt, std::nullopt, ::React::JSValue{ BackgroundInfo(record) });
    }
}

void ReactNativeBlobUtil::ReportDownloadProgress(std::string const& taskId, uint64_t written, int64_t total, ProgressThrottle& throttle) noexcept
{
    {
        std::scoped_lock lock{ m_mutex };
        const auto entry{ downloadProgressMap.find(taskId) };
        if (entry == downloadProgressMap.end())
        {
            return;
        }
        throttle.config = entry->second;
    }
    if (!throttle.ShouldReport(written, total > 0 ? static_cast<uint64_t>(total) : 0))
    {
        return;
    }
    m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilProgress",
        winrt::Microsoft::ReactNative::JSValueObject{
            {"taskId", taskId},
            {"written", static_cast<int64_t>(written)},
            {"total", total},
            {"chunk", ""},
        });
}

void ReactNativeBlobUtil::listBackgroundTasks(::React::ReactPromise<::React::JSValueArray>&& promise) noexcept
{
    [](ReactNativeBlobUtil* self, ::React::ReactPromise<::React::JSValueArray> promise) -> winrt::fire_and_forget
    {
        co_await winrt::resume_background();
        try
        {
            ::React::JSValueArray out;
            for (auto record : AllBackgroundRecords())
            {
                record = self->RefreshBackgroundRecord(record);
                ::React::JSValueObject entry;
                entry["id"] = record.id;
                entry["url"] = record.url;
                entry["path"] = record.path;
                entry["state"] = record.state;
                entry["written"] = record.written;
                entry["total"] = record.total;
                if (!record.errorCode.empty())
                {
                    entry["errorCode"] = record.errorCode;
                    entry["errorMessage"] = record.errorMessage;
                }
                out.push_back(::React::JSValue{ std::move(entry) });
            }
            promise.Resolve(std::move(out));
        }
        catch (const hresult_error& ex)
        {
            promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
        }
    }(this, std::move(promise));
}

void ReactNativeBlobUtil::attachBackgroundTask(std::string id, std::function<void(std::optional<::React::JSValue>, std::optional<std::string>, std::optional<std::string>, std::optional<::React::JSValue>)> const& callback) noexcept
{
    [](ReactNativeBlobUtil* self, std::string id, FetchCallback callback) -> winrt::fire_and_forget
    {
        co_await winrt::resume_background();
        try
        {
            auto stored{ ReadBackgroundRecord(id) };
            if (!stored)
            {
                callback(fetchError("ENOENT", "No background download \"" + id + "\""), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }
            {
                std::scoped_lock lock{ self->m_backgroundMutex };
                self->m_backgroundCallbacks.insert_or_assign(id, callback);
            }
            const auto record{ self->RefreshBackgroundRecord(*stored) };
            if (record.Finished())
            {
                self->DeliverBackground(record);
            }
            else
            {
                self->WatchBackgroundDownload(id);
            }
        }
        catch (const hresult_error& ex)
        {
            callback(fetchError("EUNSPECIFIED", winrt::to_string(ex.message())), std::nullopt, std::nullopt, std::nullopt);
        }
    }(this, std::move(id), callback);
}

void ReactNativeBlobUtil::forgetBackgroundTask(std::string id, ::React::ReactPromise<void>&& promise) noexcept
{
    {
        std::scoped_lock lock{ m_backgroundMutex };
        if (m_backgroundStarting.count(id) > 0)
        {
            m_backgroundForgotten.insert(id);
        }
    }
    [](ReactNativeBlobUtil* self, std::string id, ::React::ReactPromise<void> promise) -> winrt::fire_and_forget
    {
        co_await winrt::resume_background();
        try
        {
            self->ForgetBackground(id);
            promise.Resolve();
        }
        catch (const hresult_error& ex)
        {
            promise.Reject(rejection("EUNSPECIFIED", winrt::to_string(ex.message())));
        }
    }(this, std::move(id), std::move(promise));
}

// Claims an id for a start; false when it is taken (a start in flight, or a
// download that runs).
bool ReactNativeBlobUtil::ClaimBackgroundStart(std::string const& id, std::string const& url, std::string const& path) noexcept
{
    std::scoped_lock lock{ m_backgroundMutex };
    if (m_backgroundStarting.count(id) > 0)
    {
        return false;
    }
    try
    {
        if (auto existing{ ReadBackgroundRecord(id) }; existing && !existing->Finished())
        {
            return false;
        }
        // Listed from now on, without a job yet; the start fills it in.
        // The path as the caller wrote it, which background.list() and the
        // response give back; the file is put there through a native path.
        WriteBackgroundRecord(BackgroundRecord{ id, url, path, "", "running" });
    }
    catch (...)
    {
    }
    m_backgroundStarting.insert(id);
    m_backgroundForgotten.erase(id);
    return true;
}

// A start is done: followed from now on, or forgotten at once when a forget or
// cancel came while it was in flight.
void ReactNativeBlobUtil::BackgroundStartEnded(std::string const& id, bool started) noexcept
{
    bool forgotten{ false };
    {
        std::scoped_lock lock{ m_backgroundMutex };
        m_backgroundStarting.erase(id);
        forgotten = m_backgroundForgotten.erase(id) > 0;
    }
    if (!started)
    {
        try
        {
            RemoveBackgroundRecord(id);
        }
        catch (...)
        {
        }
        return;
    }
    if (forgotten)
    {
        ForgetBackground(id);
    }
    else
    {
        WatchBackgroundDownload(id);
    }
}

// Removes a record, cancelling the job when it still runs; a task waiting for
// it settles with ECANCELED.
void ReactNativeBlobUtil::ForgetBackground(std::string const& id) noexcept
{
    auto record{ ReadBackgroundRecord(id) };
    if (!record)
    {
        return;
    }
    RemoveBackgroundRecord(id);
    if (!record->Finished())
    {
        try
        {
            if (auto job{ BitsJob(record->guid) })
            {
                job->Cancel();
            }
        }
        catch (...)
        {
        }
    }
    FetchCallback callback;
    {
        std::scoped_lock lock{ m_backgroundMutex };
        if (auto found{ m_backgroundCallbacks.find(id) }; found != m_backgroundCallbacks.end())
        {
            callback = found->second;
            m_backgroundCallbacks.erase(found);
        }
    }
    if (callback)
    {
        callback(fetchError("ECANCELED", "The background download was forgotten"), std::nullopt, std::nullopt, ::React::JSValue{ BackgroundInfo(*record) });
    }
}

} // namespace winrt::ReactNativeBlobUtil
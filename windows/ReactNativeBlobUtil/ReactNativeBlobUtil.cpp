#include "pch.h"

#include "ReactNativeBlobUtil.h"
#include <winrt/Windows.ApplicationModel.Activation.h>
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Security.Cryptography.Core.h>
#include <winrt/Windows.Security.Cryptography.Certificates.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Storage.h>
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

    // The contents of a request body's file. Throws when it cannot be read.
    IAsyncOperation<IBuffer> readRequestFile(std::string path)
    {
        auto file = co_await StorageFile::GetFileFromPathAsync(nativePath(path));
        co_return co_await FileIO::ReadBufferAsync(file);
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
    fileCache = getBoolOrDefault(options["fileCache"]);
    followRedirect = getBoolOrDefault(options["followRedirect"]);
    overwrite = getBoolOrDefault(options["overwrite"]);
    trusty = getBoolOrDefault(options["trusty"]);

    trustSystemCerts = getBoolOrDefault(options["trustSystemCerts"]);
    bodyType = getStringOrDefault(options["bodyType"]);

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
            pathToParse.make_preferred();
            path = pathToParse.string();
        }
        else
        {
            path = "";
        }
    }

    // Timeout handling
    int64_t potentialTimeout = getInt64OrDefault(options["timeout"]);
    timeout = std::chrono::seconds{ potentialTimeout > 0 ? potentialTimeout : 60000 };
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
    struct ProgressThrottle
    {
        ReactNativeBlobUtilProgressConfig config;
        int64_t lastTickMs{ 0 };
        int64_t tick{ 0 };

        bool ShouldReport(uint64_t written, uint64_t total)
        {
            const int64_t nowMs{ winrt::clock::now().time_since_epoch().count() / 10000 };
            const double progress{ total > 0 ? static_cast<double>(written) / static_cast<double>(total) : 0.0 };

            bool crossedSlice{ true };
            if (config.count > 0 && progress > 0)
            {
                crossedSlice = static_cast<int64_t>(progress * config.count) > tick;
            }

            // Always report completion. Otherwise the final event is dropped
            // whenever it lands inside the interval window, which is what
            // happened to the upload here: the last event (written == total)
            // was thrown away and the only survivor carried zero bytes.
            const bool complete{ total > 0 && written >= total };

            if (!complete && (!crossedSlice || nowMs - lastTickMs <= static_cast<int64_t>(config.interval)))
            {
                return false;
            }

            ++tick;
            lastTickMs = nowMs;
            return true;
        }
    };

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

    // Where a response goes when the caller asked for a file. An explicit path
    // wins; otherwise the name matches Android's (ReactNativeBlobUtilTmp_<taskId>
    // plus appendExt), under the directory fs.dirs reports as CacheDir so JS can
    // stat, session and unlink it.
    std::string ResponseFilePath(const ReactNativeBlobUtilConfig& config, const std::string& taskId)
    {
        if (!config.path.empty())
        {
            return config.path;
        }

        std::string path = winrt::to_string(
            winrt::Windows::Storage::ApplicationData::Current().LocalCacheFolder().Path())
            + "\\ReactNativeBlobUtilTmp_" + taskId;
        if (!config.appendExt.empty())
        {
            path += "." + config.appendExt;
        }

        return path;
    }

    // Hands the response to fetch.js in the shape it expects: a file reference
    // when the caller asked for one through fileCache or path - the same
    // contract as Android and iOS, so res.path() resolves - and the decoded text
    // otherwise.
    winrt::Windows::Foundation::IAsyncAction DeliverResponseAsync(
        winrt::Windows::Web::Http::HttpResponseMessage response,
        ReactNativeBlobUtilConfig config,
        std::string taskId,
        std::function<void(std::optional<::React::JSValue>, std::optional<std::string>, std::optional<std::string>, std::optional<::React::JSValue>)> callback)
    {
        if (!config.fileCache && config.path.empty())
        {
            std::string responseBody;
            if (response.Content() != nullptr)
            {
                responseBody = winrt::to_string(co_await response.Content().ReadAsStringAsync());
            }

            // (err, rawType, data, responseInfo) as four arguments - the shape
            // fetch.js destructures and the one Android already sends. The body is
            // read as text here, so it is always the utf8 form.
            callback(std::nullopt, "utf8", responseBody, std::nullopt);
            co_return;
        }

        const std::string destination = ResponseFilePath(config, taskId);
        const std::filesystem::path path{ destination };

        winrt::Windows::Storage::Streams::IBuffer buffer{ nullptr };
        if (response.Content() != nullptr)
        {
            buffer = co_await response.Content().ReadAsBufferAsync();
        }

        // Android and iOS write to a path whose directory does not exist yet -
        // see the issue-453 case in the network scenario - so Windows creates
        // the missing parents rather than failing to open them.
        std::error_code directoryError;
        std::filesystem::create_directories(path.parent_path(), directoryError);

        const auto folder = co_await winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(
            path.parent_path().wstring());
        const auto file = co_await folder.CreateFileAsync(
            path.filename().wstring(),
            winrt::Windows::Storage::CreationCollisionOption::ReplaceExisting);

        if (buffer != nullptr)
        {
            co_await winrt::Windows::Storage::FileIO::WriteBufferAsync(file, buffer);
        }

        callback(std::nullopt, "path", destination, std::nullopt);
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

            winrt::Windows::Foundation::Uri requestUri{ nullptr };
            if (!TryParseRequestUri(url, requestUri))
            {
                callback(fetchError("EINVAL", "Invalid URL: " + url), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }

            winrt::hstring boundary{ L"-----" };
            winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter filter;
            ReactNativeBlobUtilConfig config{ options };
            filter.AllowAutoRedirect(false);

            if (config.trusty)
            {
                filter.IgnorableServerCertificateErrors().Append(
                    winrt::Windows::Security::Cryptography::Certificates::ChainValidationResult::Untrusted);
            }
            else
            {
                ConfigureServerTrust(filter, config, requestUri);
            }

            winrt::Windows::Web::Http::HttpRequestMessage requestMessage{ httpMethodFor(method), requestUri };
            winrt::Windows::Web::Http::HttpMultipartFormDataContent requestContent{ boundary };

            // Add headers
            if (headers.ItemCount() > 0)
            {
                for (const auto& entry : headers.AsObject())
                {
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
                    // A file that cannot be read leaves the part empty, as on Android and iOS.
                    try
                    {
                        partBuffer = co_await readRequestFile(pathOfFileReference(data));
                    }
                    catch (winrt::hresult_error const&)
                    {
                    }
                }
                else if (kind == "base64")
                {
                    try
                    {
                        partBuffer = CryptographicBuffer::DecodeFromBase64String(winrt::to_hstring(data));
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

            winrt::Windows::Web::Http::HttpClient httpClient{ filter };
            // Progress. SendRequestAsync reports both directions, so one handler
            // covers upload and download. The config is looked up on every
            // callback rather than once here, because fetch.js starts the
            // request first and only then calls enableProgressReport() - at send
            // time the entry does not exist yet. Android looks it up per chunk
            // for the same reason. Windows sent no progress events at all before
            // this: the only code that emitted them lives in ProcessRequestAsync,
            // which nothing calls.
            ProgressThrottle downloadThrottle, uploadThrottle;

            auto sendOperation{ httpClient.SendRequestAsync(requestMessage) };
            sendOperation.Progress([this, taskId, downloadThrottle, uploadThrottle](
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

                // Numbers, matching what Android and iOS now emit, with -1 as
                // the unknown-length sentinel they already use.
                m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit",
                    sending ? L"ReactNativeBlobUtilProgress-upload" : L"ReactNativeBlobUtilProgress",
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"taskId", taskId},
                        {"written", static_cast<int64_t>(written)},
                        {"total", total},
                        {"chunk", ""},
                    });
            });

            auto response = co_await sendOperation;

            co_await DeliverResponseAsync(response, config, taskId, callback);
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

        try
        {
            // Off the caller's thread before anything else - see fetchBlobForm.
            co_await winrt::resume_background();

            winrt::Windows::Foundation::Uri requestUri{ nullptr };
            if (!TryParseRequestUri(url, requestUri))
            {
                callback(fetchError("EINVAL", "Invalid URL: " + url), std::nullopt, std::nullopt, std::nullopt);
                co_return;
            }

            winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter filter;
            ReactNativeBlobUtilConfig config{ optionsRef };
            filter.AllowAutoRedirect(false);
            if (config.trusty)
            {
                filter.IgnorableServerCertificateErrors().Append(Cryptography::Certificates::ChainValidationResult::Untrusted);
            }
            else
            {
                ConfigureServerTrust(filter, config, requestUri);
            }

            winrt::Windows::Web::Http::HttpClient httpClient{ filter };

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
                try
                {
                    requestBuffer = co_await readRequestFile(path);
                }
                catch (winrt::hresult_error const&)
                {
                }
                if (!requestBuffer)
                {
                    callback(fetchError("ENOENT", "No such file '" + path + "'"), std::nullopt, std::nullopt, std::nullopt);
                    co_return;
                }
            }
            else if (!body.empty() && kind == "base64")
            {
                requestBuffer = CryptographicBuffer::DecodeFromBase64String(winrt::to_hstring(body));
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
                if (!requestMessage.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString())) && requestContent)
                {
                    requestContent.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString()));
                }
            }
            if (requestContent)
            {
                requestMessage.Content(requestContent);
            }

            // Send the request
            // Progress. SendRequestAsync reports both directions, so one handler
            // covers upload and download. The config is looked up on every
            // callback rather than once here, because fetch.js starts the
            // request first and only then calls enableProgressReport() - at send
            // time the entry does not exist yet. Android looks it up per chunk
            // for the same reason. Windows sent no progress events at all before
            // this: the only code that emitted them lives in ProcessRequestAsync,
            // which nothing calls.
            ProgressThrottle downloadThrottle, uploadThrottle;

            auto sendOperation{ httpClient.SendRequestAsync(requestMessage) };
            sendOperation.Progress([this, taskId, downloadThrottle, uploadThrottle](
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

                // Numbers, matching what Android and iOS now emit, with -1 as
                // the unknown-length sentinel they already use.
                m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit",
                    sending ? L"ReactNativeBlobUtilProgress-upload" : L"ReactNativeBlobUtilProgress",
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"taskId", taskId},
                        {"written", static_cast<int64_t>(written)},
                        {"total", total},
                        {"chunk", ""},
                    });
            });

            auto response = co_await sendOperation;

            co_await DeliverResponseAsync(response, config, taskId, callback);
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
        bool shouldExit{ false };
        Streams::IBuffer buffer;
        if (encoding.compare("uri") == 0)
        {
            try
            {
                winrt::hstring srcDirectoryPath, srcFileName;
                splitPath(content, srcDirectoryPath, srcFileName);
                StorageFolder srcFolder{ co_await StorageFolder::GetFolderFromPathAsync(srcDirectoryPath) };
                StorageFile srcFile{ co_await srcFolder.GetFileAsync(srcFileName) };
                buffer = co_await FileIO::ReadBufferAsync(srcFile);
            }
            catch (...)
            {
                shouldExit = true;
            }
        }
        else if (encoding.compare("utf8") == 0)
        {
            buffer = CryptographicBuffer::ConvertStringToBinary(content, BinaryStringEncoding::Utf8);
        }
        else if (encoding.compare("base64") == 0)
        {
            buffer = CryptographicBuffer::DecodeFromBase64String(content);
        }
        else
        {
            promise.Reject("Invalid encoding");
            shouldExit = true;
        }

        if (!shouldExit)
        {

            winrt::hstring destDirectoryPath, destFileName;
            splitPath(path, destDirectoryPath, destFileName);

            auto folder{ co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath) };

            try
            {
                auto file{ co_await folder.CreateFileAsync(destFileName, CreationCollisionOption::FailIfExists) };
                auto stream{ co_await file.OpenAsync(FileAccessMode::ReadWrite) };
                co_await stream.WriteAsync(buffer);
            }
            catch (...)
            {
                promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "EEXIST", "EEXIST: File already exists; " + path });
                shouldExit = true;
            }
        }
        if (!shouldExit)
        {
            promise.Resolve();
        }
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
            Streams::IBuffer buffer;
            if (encoding.compare("utf8") == 0)
            {
                buffer = Cryptography::CryptographicBuffer::ConvertStringToBinary(data, BinaryStringEncoding::Utf8);
            }
            else if (encoding.compare("base64") == 0)
            {
                buffer = Cryptography::CryptographicBuffer::DecodeFromBase64String(data);
            }
            else if (encoding.compare("uri") == 0)
            {
                winrt::hstring srcDirectoryPath, srcFileName;
                splitPath(data, srcDirectoryPath, srcFileName);
                StorageFolder srcFolder{ co_await StorageFolder::GetFolderFromPathAsync(srcDirectoryPath) };
                StorageFile srcFile{ co_await srcFolder.GetFileAsync(srcFileName) };
                buffer = co_await FileIO::ReadBufferAsync(srcFile);
            }
            else
            {
                auto errorMessage{ "Invalid encoding: " + encoding };
                promise.Reject(errorMessage.c_str());
            }

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
            buffer = Cryptography::CryptographicBuffer::DecodeFromBase64String(winrt::to_hstring(data));
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
            if (std::filesystem::is_directory(path))
            {
                std::filesystem::path unlinkPath(path);
                unlinkPath.make_preferred();
                auto folderOp = winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(
                    winrt::to_hstring(unlinkPath.c_str()));
               co_await folderOp.get().DeleteAsync();
            }
            else
            {
                winrt::hstring directoryPath, fileName;
                splitPath(path, directoryPath, fileName);
                auto folder = co_await winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(directoryPath);
                auto item = co_await folder.GetItemAsync(fileName);
                co_await item.DeleteAsync();
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
            if (pathValue)
            {
                std::string path = pathValue.AsString();
                if (!std::filesystem::exists(path))
                {
                    continue;
                }
                auto file = co_await winrt::Windows::Storage::StorageFile::GetFileFromPathAsync(nativePath(path));
                co_await file.DeleteAsync();
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
            std::string utf8Content = winrt::to_string(Cryptography::CryptographicBuffer::ConvertBinaryToString(BinaryStringEncoding::Utf8, buffer));
            resultArray.push_back(utf8Content);
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
        // Note: SHA224 is not part of winrt 
        if (algorithm.compare("sha224") == 0)
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "Error", "WinRT does not offer sha224 encryption." });
            co_return;
        }

        winrt::hstring directoryPath, fileName;
        splitPath(path, directoryPath, fileName);

        StorageFolder folder{ co_await StorageFolder::GetFolderFromPathAsync(directoryPath) };
        StorageFile file{ co_await folder.GetFileAsync(fileName) };

        auto search{ availableHashes.find(algorithm) };
        if (search == availableHashes.end())
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "Error", "Invalid hash algorithm " + algorithm });
            co_return;
        }

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

        for (;;)
        {
            auto readBuffer = co_await stream.ReadAsync(buffer, buffer.Capacity(), InputStreamOptions::None);
            if (readBuffer.Length() == 0)
            {
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
                winrt::hstring stringContent = Cryptography::CryptographicBuffer::ConvertBinaryToString(
                    BinaryStringEncoding::Utf8, readBuffer);

                m_context.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilFilesystem",
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"streamId", streamId},
                        {"event", "data"},
                        {"detail", winrt::to_string(stringContent)}
                    });
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

void ReactNativeBlobUtil::cancelRequest(
    std::string taskId,
    ::React::ReactPromise<void>&& promise) noexcept
{
    try
    {
        m_tasks.Cancel(taskId);
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
    ::React::ReactPromise<std::string>&& result) noexcept
{    
    // No-op: Android API
    result.Resolve("");
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

void ReactNativeBlobUtil::getContentIntent(
    std::string mime,
    ::React::ReactPromise<std::string>&& result) noexcept
{
    // No-op: Android API
    result.Resolve("");
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

} // namespace winrt::ReactNativeBlobUtil
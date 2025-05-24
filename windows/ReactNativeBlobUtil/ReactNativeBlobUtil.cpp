#include "pch.h"

#include "ReactNativeBlobUtil.h"
#include <winrt/Windows.ApplicationModel.Activation.h>
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Security.Cryptography.Core.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Web.Http.h>
#include <winrt/Windows.Web.Http.Headers.h>
#include <winrt/windows.web.http.filters.h>
#include <winrt/Windows.System.Threading.h>
#include <filesystem>
#include <sstream> 

using namespace winrt;
using namespace winrt::Windows::ApplicationModel;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Storage::Streams;
using namespace winrt::Windows::Foundation;
using namespace winrt::Windows::Security::Cryptography;
using namespace winrt::Windows::Security::Cryptography::Core;
using namespace std::chrono_literals;

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
        return constants;
    }

    winrt::fire_and_forget ReactNativeBlobUtil::fetchBlobForm(
        ::React::JSValue options,
        std::string taskId,
        std::string method,
        std::string url,
        ::React::JSValue headers,
        ::React::JSValueArray body,
        std::function<void(::React::JSValueArray)> callback
    ) noexcept
    {
        try
        {
            winrt::hstring boundary{ L"-----" };
            winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter filter;
            ReactNativeBlobUtilConfig config{ options };
            filter.AllowAutoRedirect(false);

            if (config.trusty)
            {
                filter.IgnorableServerCertificateErrors().Append(
                    winrt::Windows::Security::Cryptography::Certificates::ChainValidationResult::Untrusted);
            }

            winrt::Windows::Web::Http::HttpMethod httpMethod = winrt::Windows::Web::Http::HttpMethod::Post();
            if (method == "DELETE" || method == "delete")
                httpMethod = winrt::Windows::Web::Http::HttpMethod::Delete();
            else if (method == "PUT" || method == "put")
                httpMethod = winrt::Windows::Web::Http::HttpMethod::Put();
            else if (method == "GET" || method == "get")
                httpMethod = winrt::Windows::Web::Http::HttpMethod::Get();
            else if (method != "POST" && method != "post")
            {
                ::React::JSValueArray errorArray;
                errorArray.push_back("Method not supported");
                callback(std::move(errorArray));
                co_return;
            }

            winrt::Windows::Web::Http::HttpRequestMessage requestMessage{ httpMethod, winrt::Windows::Foundation::Uri{ winrt::to_hstring(url) } };
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

            // Add form data
            for (auto& entry : body)
            {
                auto& items = entry.AsObject();
                auto data = items["data"].AsString();

                // File upload support: expects "file://" prefix
                bool isFile = data.rfind("file://", 0) == 0;
                if (isFile)
                {
                    std::string contentPath = data.substr(strlen("file://"));
                    winrt::hstring directoryPath, fileName;
                    splitPath(contentPath, directoryPath, fileName);
                    auto folder = co_await winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(directoryPath);
                    auto storageFile = co_await folder.GetFileAsync(fileName);
                    auto requestBuffer = co_await winrt::Windows::Storage::FileIO::ReadBufferAsync(storageFile);

                    winrt::Windows::Web::Http::HttpBufferContent requestBufferContent{ requestBuffer };
                    if (!items["type"].IsNull())
                    {
                        requestBufferContent.Headers().TryAppendWithoutValidation(
                            L"content-type", winrt::to_hstring(items["type"].AsString()));
                    }

                    auto name = items["name"].IsNull() ? L"" : winrt::to_hstring(items["name"].AsString());
                    auto filename = items["filename"].IsNull() ? L"" : winrt::to_hstring(items["filename"].AsString());
                    if (name.empty())
                    {
                        requestContent.Add(requestBufferContent);
                    }
                    else if (filename.empty())
                    {
                        requestContent.Add(requestBufferContent, name);
                    }
                    else
                    {
                        requestContent.Add(requestBufferContent, name, filename);
                    }
                }
                else
                {
                    winrt::Windows::Web::Http::HttpStringContent dataContents{ winrt::to_hstring(data) };
                    if (!items["type"].IsNull())
                    {
                        dataContents.Headers().TryAppendWithoutValidation(
                            L"content-type", winrt::to_hstring(items["type"].AsString()));
                    }

                    auto name = items["name"].IsNull() ? L"" : winrt::to_hstring(items["name"].AsString());
                    auto filename = items["filename"].IsNull() ? L"" : winrt::to_hstring(items["filename"].AsString());
                    if (name.empty())
                    {
                        requestContent.Add(dataContents);
                    }
                    else if (filename.empty())
                    {
                        requestContent.Add(dataContents, name);
                    }
                    else
                    {
                        requestContent.Add(dataContents, name, filename);
                    }
                }
            }

            requestMessage.Content(requestContent);

            winrt::Windows::Web::Http::HttpClient httpClient{ filter };
            auto response = co_await httpClient.SendRequestAsync(requestMessage);

            std::string responseBody;
            if (response.Content() != nullptr)
            {
                responseBody = winrt::to_string(co_await response.Content().ReadAsStringAsync());
            }

            ::React::JSValueArray resultArray;
            resultArray.push_back(responseBody);
            callback(std::move(resultArray));
        }
        catch (const winrt::hresult_error& ex)
        {
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back(winrt::to_string(ex.message()));
            callback(std::move(errorArray));
        }
        catch (...)
        {
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back("Unknown error in fetchBlobForm");
            callback(std::move(errorArray));
        }
    }

    winrt::fire_and_forget ReactNativeBlobUtil::fetchBlob(
        ::React::JSValue options,
        std::string taskId,
        std::string method,
        std::string url,
        ::React::JSValue headers,
        std::string body,
        std::function<void(::React::JSValueArray)> callback
    ) noexcept
    {
        // Convert rvalue references to lvalues for safe use
        ::React::JSValue& optionsRef = options;
        ::React::JSValue& headersRef = headers;

        try
        {
            winrt::Windows::Web::Http::Filters::HttpBaseProtocolFilter filter;
            ReactNativeBlobUtilConfig config{ optionsRef };
            filter.AllowAutoRedirect(false);
            if (config.trusty)
            {
                filter.IgnorableServerCertificateErrors().Append(Cryptography::Certificates::ChainValidationResult::Untrusted);
            }

            winrt::Windows::Web::Http::HttpClient httpClient{ filter };

            winrt::Windows::Web::Http::HttpMethod httpMethod{ winrt::Windows::Web::Http::HttpMethod::Post() };
            if (method == "DELETE" || method == "delete")
            {
                httpMethod = winrt::Windows::Web::Http::HttpMethod::Delete();
            }
            else if (method == "PUT" || method == "put")
            {
                httpMethod = winrt::Windows::Web::Http::HttpMethod::Put();
            }
            else if (method == "GET" || method == "get")
            {
                httpMethod = winrt::Windows::Web::Http::HttpMethod::Get();
            }
            else
            {
                ::React::JSValueArray errorArray;
                errorArray.push_back("Method not supported");
                callback(std::move(errorArray));
                co_return;
            }

            winrt::Windows::Web::Http::HttpRequestMessage requestMessage{
                httpMethod,
                winrt::Windows::Foundation::Uri{ winrt::to_hstring(url) }
            };

            std::string prefix = "file://";
            bool pathToFile = body.rfind(prefix, 0) == 0;
            if (pathToFile)
            {
                std::string contentPath = body.substr(prefix.length());
                size_t fileLength = contentPath.length();
                bool hasTrailingSlash = contentPath[fileLength - 1] == '\\' || contentPath[fileLength - 1] == '/';
                winrt::hstring directoryPath, fileName;
                splitPath(hasTrailingSlash ? contentPath.substr(0, fileLength - 1) : contentPath, directoryPath, fileName);
                auto folder = co_await winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(directoryPath);
                auto storageFile = co_await folder.GetFileAsync(fileName);
                auto requestBuffer = co_await winrt::Windows::Storage::FileIO::ReadBufferAsync(storageFile);

                winrt::Windows::Web::Http::HttpBufferContent requestContent{ requestBuffer };

                for (const auto& entry : headersRef.AsObject())
                {
                    if (!requestMessage.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString())))
                    {
                        requestContent.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString()));
                    }
                }
                requestMessage.Content(requestContent);
            }
            else if (!body.empty()) {
                winrt::Windows::Web::Http::HttpStringContent requestString{ winrt::to_hstring(body) };

                for (const auto& entry : headersRef.AsObject())
                {
                    if (!requestMessage.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString())))
                    {
                        requestString.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString()));
                    }
                }
                requestMessage.Content(requestString);
            }
            else {
                for (const auto& entry : headersRef.AsObject())
                {
                    requestMessage.Headers().TryAppendWithoutValidation(winrt::to_hstring(entry.first), winrt::to_hstring(entry.second.AsString()));
                }
            }

            // Send the request
            auto response = co_await httpClient.SendRequestAsync(requestMessage);

            std::string responseBody;
            if (response.Content() != nullptr)
            {
                responseBody = winrt::to_string(co_await response.Content().ReadAsStringAsync());
            }

            ::React::JSValueArray resultArray;
            resultArray.push_back(responseBody);
            callback(std::move(resultArray));
        }
        catch (const winrt::hresult_error& ex)
        {
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back(winrt::to_string(ex.message()));
            callback(std::move(errorArray));
        }
        catch (...)
        {
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back("Unknown error in fetchBlob");
            callback(std::move(errorArray));
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
    std::function<void(std::vector<bool> const&)> const& callback) noexcept
{
    try
    {
        std::filesystem::path fsPath(path);
        bool doesExist = std::filesystem::exists(fsPath);
        bool isDirectory = std::filesystem::is_directory(fsPath);

        callback(std::vector<bool>{ doesExist, isDirectory });
    }
    catch (const std::exception&)
    {
        // If something goes wrong, return false, false
        callback(std::vector<bool>{ false, false });
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::writeStream(
    std::string path,
    std::string encoding,
    bool appendData,
    std::function<void(::React::JSValueArray)> callback) noexcept
{
    try
    {
        winrt::hstring directoryPath, fileName;
        splitPath(path, directoryPath, fileName);
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
            // Return error as JSValueArray
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back("Invalid encoding: " + encoding);
            errorArray.push_back("");
            callback(std::move(errorArray));
            co_return;
        }

        // Generate a random streamId
        uint32_t length = 16;
        IBuffer buffer = Cryptography::CryptographicBuffer::GenerateRandom(length);
        std::string streamId = winrt::to_string(Cryptography::CryptographicBuffer::EncodeToHexString(buffer));

        ReactNativeBlobUtilStream streamInstance{ stream, encodingOption };
        m_streamMap.try_emplace(streamId, streamInstance);

        // Return success as JSValueArray
        ::React::JSValueArray resultArray;
        resultArray.push_back(""); // no error
        resultArray.push_back(""); // no message
        resultArray.push_back(streamId);
        callback(std::move(resultArray));
    }
    catch (const winrt::hresult_error& ex)
    {
        ::React::JSValueArray errorArray;
        errorArray.push_back("EUNSPECIFIED");
        errorArray.push_back("Failed to create write stream at path '" + path + "'; " + winrt::to_string(ex.message()));
        errorArray.push_back("");
        callback(std::move(errorArray));
    }
}

void ReactNativeBlobUtil::writeArrayChunk(
    std::string streamId,
    ::React::JSValueArray&& dataArray,
    std::function<void(::React::JSValueArray const&)> const& callback) noexcept
{
    try
    {
        auto streamIt = m_streamMap.find(streamId);
        if (streamIt == m_streamMap.end()) {
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back("Stream not found for id: " + streamId);
            callback(errorArray);
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
        ::React::JSValueArray resultArray;
        callback(resultArray); // Success: empty array
    }
    catch (const winrt::hresult_error& ex)
    {
        ::React::JSValueArray errorArray;
        errorArray.push_back("EUNSPECIFIED");
        errorArray.push_back(winrt::to_string(ex.message()));
        callback(errorArray);
    }
}

void ReactNativeBlobUtil::writeChunk(
    std::string streamId,
    std::string data,
    std::function<void(::React::JSValueArray const&)> const& callback) noexcept
{
    try
    {
        auto streamIt = m_streamMap.find(streamId);
        if (streamIt == m_streamMap.end()) {
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back("Stream not found for id: " + streamId);
            callback(errorArray);
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
            ::React::JSValueArray errorArray;
            errorArray.push_back("EUNSPECIFIED");
            errorArray.push_back("Invalid encoding type");
            callback(errorArray);
            return;
        }
        stream.streamInstance.WriteAsync(buffer).get(); // Synchronous write
        ::React::JSValueArray resultArray;
        callback(resultArray); // Success: empty array
    }
    catch (const winrt::hresult_error& ex)
    {
        ::React::JSValueArray errorArray;
        errorArray.push_back("EUNSPECIFIED");
        errorArray.push_back(winrt::to_string(ex.message()));
        callback(errorArray);
    }
}

void ReactNativeBlobUtil::closeStream(
    std::string streamId,
    std::function<void(::React::JSValueArray const&)> const& callback) noexcept
{
    ::React::JSValueArray resultArray;
    try
    {
        auto it = m_streamMap.find(streamId);
        if (it != m_streamMap.end()) {
            it->second.streamInstance.Close();
            m_streamMap.erase(it);
            // Success: return empty array
            callback(resultArray);
        } else {
            // Stream not found
            resultArray.push_back("EUNSPECIFIED");
            resultArray.push_back("Stream not found for id: " + streamId);
            callback(resultArray);
        }
    }
    catch (const winrt::hresult_error& ex)
    {
        resultArray.push_back("EUNSPECIFIED");
        resultArray.push_back(winrt::to_string(ex.message()));
        callback(resultArray);
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::unlink(
    std::string path,
    std::function<void(::React::JSValueArray)> callback) noexcept
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

            ::React::JSValueArray result;
            result.push_back(::React::JSValue(true));
            callback(std::move(result));
        }
        catch (const winrt::hresult_error& ex)
        {
            ::React::JSValueArray errorResult;
            errorResult.push_back(::React::JSValue(false));
            errorResult.push_back(::React::JSValue(winrt::to_string(ex.message())));
            callback(std::move(errorResult));
        }
   
}

winrt::fire_and_forget ReactNativeBlobUtil::removeSession(::React::JSValueArray paths, std::function<void(::React::JSValueArray)> callback) noexcept
{
    try
    {
        for (const auto& pathValue : paths)
        {
            if (pathValue)
            {
                std::string path = pathValue.AsString();
                auto folder = co_await winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(winrt::to_hstring(path));
                auto file = co_await folder.GetFileAsync(winrt::to_hstring(path));
                co_await file.DeleteAsync();
            }
        }

        ::React::JSValueArray resultArray;
        resultArray.push_back("SUCCESS");
        callback(std::move(resultArray));
    }
    catch (const winrt::hresult_error& ex)
    {
        ::React::JSValueArray errorArray;
        errorArray.push_back("ERROR");
        errorArray.push_back(winrt::to_string(ex.message()));
        callback(std::move(errorArray));
    }
    catch (...)
    {
        ::React::JSValueArray errorArray;
        errorArray.push_back("ERROR");
        errorArray.push_back("Unknown error in removeSession");
        callback(std::move(errorArray));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::ls(
    std::string path,
    ::React::ReactPromise<::React::JSValueArray> promise) noexcept
{
    try
    {
        winrt::hstring directoryPath, fileName;
        splitPath(path, directoryPath, fileName);

        auto folder = co_await Windows::Storage::StorageFolder::GetFolderFromPathAsync(directoryPath);
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
    std::function<void(::React::JSValueArray)> callback) noexcept
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
        fileInfo["lastModified"] = winrt::clock::to_time_t(properties.DateModified());;
        fileInfo["type"] = isDirectory ? "directory" : "file";

        ::React::JSValueArray result;
        result.push_back(std::move(fileInfo));
        callback(std::move(result));
    }
    catch (const hresult_error& ex)
    {
        ::React::JSValueArray errorArray;
        ::React::JSValueObject error;
        error["error"] = winrt::to_string(ex.message());
        errorArray.push_back(std::move(error));
        callback(std::move(errorArray));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::lstat(
    std::string path,
    std::function<void(::React::JSValueArray)> callback) noexcept
{
    try
    {
        std::filesystem::path directory(path);
        directory.make_preferred();
        StorageFolder targetDirectory{ co_await StorageFolder::GetFolderFromPathAsync(directory.c_str()) };

        winrt::Microsoft::ReactNative::JSValueArray resultsArray;

        auto items{ co_await targetDirectory.GetItemsAsync() };
        for (auto item : items)
        {
            auto properties{ co_await item.GetBasicPropertiesAsync() };

            winrt::Microsoft::ReactNative::JSValueObject itemInfo;

            itemInfo["filename"] = to_string(item.Name());
            itemInfo["path"] = to_string(item.Path());
            itemInfo["size"] = properties.Size();
            itemInfo["type"] = item.IsOfType(StorageItemTypes::Folder) ? "directory" : "file";
            itemInfo["lastModified"] = properties.DateModified().time_since_epoch() / std::chrono::seconds(1) - UNIX_EPOCH_IN_WINRT_SECONDS;

            resultsArray.push_back(std::move(itemInfo));
        }

        callback(std::move(resultsArray));
    }
    catch (...)
    {
        // "Failed to read directory."
        winrt::Microsoft::ReactNative::JSValueArray emptyArray;
        callback(std::move(emptyArray));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::cp(
    std::string src,
    std::string dest,
    std::function<void(::React::JSValueArray)> callback) noexcept
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
        co_await file.CopyAsync(destFolder, destFileName, NameCollisionOption::FailIfExists);

        ::React::JSValueArray success{};
        callback(std::move(success));
    }
    catch (const winrt::hresult_error& ex)
    {
        ::React::JSValueArray error{ winrt::to_string(ex.message()) };
        callback(std::move(error));
    }
}

winrt::fire_and_forget ReactNativeBlobUtil::mv(
    std::string src,
    std::string dest,
    std::function<void(::React::JSValueArray)> callback) noexcept
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

        ::React::JSValueArray success{}; // Success: empty array
        callback(std::move(success));
    }
    catch (const winrt::hresult_error& ex)
    {
        ::React::JSValueArray error{ winrt::to_string(ex.message()) };
        callback(std::move(error));
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

        // Consistent with Apple's createDirectoryAtPath method and result, but not with Android's
        std::error_code ec;
        bool created = std::filesystem::create_directories(dirPath, ec);
        if (!created && !std::filesystem::exists(dirPath))
        {
            promise.Reject(winrt::Microsoft::ReactNative::ReactError{ "ENOENT", "ENOENT: no such file or directory, open " + path });
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
        else
        {
            std::string utf8Content = winrt::to_string(Cryptography::CryptographicBuffer::ConvertBinaryToString(BinaryStringEncoding::Utf8, buffer));
            if (encoding == "ascii")
            {
                // For ASCII, just return the utf8Content as a string
                resultArray.push_back(utf8Content);
            }
            else
            {
                resultArray.push_back(utf8Content);
            }
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
            // Invalid encoding
            m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", streamId,
                winrt::Microsoft::ReactNative::JSValueObject{
                    {"event", "error"},
                    {"EINVAL", "Unsupported encoding: " + encoding}
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
                m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", streamId,
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"event", "end"}
                    });
                break;
            }

            if (usedEncoding == EncodingOptions::BASE64)
            {
                winrt::hstring base64Content = Cryptography::CryptographicBuffer::EncodeToBase64String(readBuffer);
                m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", streamId,
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"event", "data"},
                        {"detail", winrt::to_string(base64Content)}
                    });
            }
            else
            {
                winrt::hstring stringContent = Cryptography::CryptographicBuffer::ConvertBinaryToString(
                    BinaryStringEncoding::Utf8, readBuffer);
                std::string utf8Content = winrt::to_string(stringContent);

                // For ASCII, trim to 7-bit range
                if (usedEncoding == EncodingOptions::ASCII)
                {
                    for (char& c : utf8Content)
                    {
                        c &= 0x7F;
                    }
                }

                m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", streamId,
                    winrt::Microsoft::ReactNative::JSValueObject{
                        {"event", "data"},
                        {"detail", utf8Content}
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
        hresult result = ex.code();
        if (result == HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND)) // 0x80070002
        {
            m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", streamId,
                winrt::Microsoft::ReactNative::JSValueObject{
                    {"event", "error"},
                    {"ENOENT", "No such file: " + path}
                });
        }
        else
        {
            m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", streamId,
                winrt::Microsoft::ReactNative::JSValueObject{
                    {"event", "error"},
                    {"EUNSPECIFIED", winrt::to_string(ex.message())}
                });
        }
    }
}

void ReactNativeBlobUtil::getEnvironmentDirs(
    std::function<void(::React::JSValueArray const&)> const& callback) noexcept
{
    callback(::React::JSValueArray{});
}

void ReactNativeBlobUtil::cancelRequest(
    std::string taskId,
    std::function<void(::React::JSValueArray const&)> const& callback) noexcept
{
    ::React::JSValueArray resultArray;
    try
    {
        m_tasks.Cancel(taskId);
        // Success: return empty array
        callback(resultArray);
    }
    catch (const winrt::hresult_error& ex)
    {
        resultArray.push_back("EUNSPECIFIED");
        resultArray.push_back(winrt::to_string(ex.message()));
        callback(resultArray);
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
        winrt::hstring srcDirectoryPath, srcFileName, destDirectoryPath, destFileName;
        splitPath(src, srcDirectoryPath, srcFileName);
        splitPath(src, destDirectoryPath, destFileName);

        StorageFolder srcFolder{ co_await StorageFolder::GetFolderFromPathAsync(srcDirectoryPath) };
        StorageFolder destFolder{ co_await StorageFolder::GetFolderFromPathAsync(destDirectoryPath) };

        StorageFile srcFile{ co_await srcFolder.GetFileAsync(srcFileName) };
        StorageFile destFile{ co_await destFolder.CreateFileAsync(destFileName, CreationCollisionOption::OpenIfExists) };

        uint64_t uStart = static_cast<uint64_t>(start);
        uint64_t uEnd = static_cast<uint64_t>(end);
        uint32_t length = static_cast<uint32_t>(uEnd > uStart ? uEnd - uStart : 0);

        if (length == 0) {
            promise.Reject("Invalid slice range");
            co_return;
        }
        Streams::IBuffer buffer;
        Streams::IRandomAccessStream stream{ co_await srcFile.OpenAsync(FileAccessMode::Read) };
        stream.Seek(start);
        stream.ReadAsync(buffer, length, Streams::InputStreamOptions::None);
        co_await FileIO::WriteBufferAsync(destFile, buffer);

        promise.Resolve(dest);
    }
    catch (...)
    {
        promise.Reject("Unable to slice file");
    }
}

IAsyncAction setTimeout(std::chrono::seconds time) {
	co_await time;
}

void ReactNativeBlobUtil::presentOptionsMenu(
    std::string uri,
    std::string scheme,
    ::React::ReactPromise<::React::JSValueArray>&& result) noexcept
{
    result.Resolve(::React::JSValueArray{});
}

void ReactNativeBlobUtil::presentOpenInMenu(
    std::string uri,
    std::string scheme,
    ::React::ReactPromise<::React::JSValueArray>&& result) noexcept
{
    result.Resolve(::React::JSValueArray{});
}

void ReactNativeBlobUtil::presentPreview(
    std::string uri,
    std::string scheme,
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
    std::function<void(::React::JSValueArray)> callback) noexcept
{ 
        try
        {
            auto localFolder = winrt::Windows::Storage::ApplicationData::Current().LocalFolder();
            auto properties{ co_await localFolder.Properties().RetrievePropertiesAsync({L"System.FreeSpace", L"System.Capacity"}) };

            winrt::Microsoft::ReactNative::JSValueObject result;
            result["free"] = winrt::unbox_value<uint64_t>(properties.Lookup(L"System.FreeSpace"));
            result["total"] = winrt::unbox_value<uint64_t>(properties.Lookup(L"System.Capacity"));

            ::React::JSValueArray arr;
            arr.push_back(::React::JSValueObject(std::move(result)));
            callback(std::move(arr));
        }
        catch (...)
        {
            ::React::JSValueArray arr;
            winrt::Microsoft::ReactNative::JSValueObject error;
            error["error"] = "Failed to get storage usage.";
            arr.push_back(::React::JSValueObject(std::move(error)));
            callback(std::move(arr));
        }
   
}

void ReactNativeBlobUtil::emitExpiredEvent(
    std::function<void(std::string)> const& callback) noexcept
{
    callback("");
}

void ReactNativeBlobUtil::actionViewIntent(
    std::string path,
    std::string mime,
    std::string chooserTitle,
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
    std::function<void(::React::JSValueArray const&)> const& callback) noexcept
{
    // No-op: Android API
    callback(::React::JSValueArray{});
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

	m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilState",
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
				m_reactContext.CallJSFunction(L"RCTDeviceEventEmitter", L"emit", L"ReactNativeBlobUtilProgress",
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
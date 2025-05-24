
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off

// #include "NativeBlobUtilsDataTypes.g.h" before this file to use the generated type definition
#include <NativeModules.h>
#include <tuple>

namespace ReactNativeBlobUtilCodegen {

inline winrt::Microsoft::ReactNative::FieldMap GetStructInfo(BlobUtilsSpec_Constants*) noexcept {
    winrt::Microsoft::ReactNative::FieldMap fieldMap {
        {L"CacheDir", &BlobUtilsSpec_Constants::CacheDir},
        {L"DocumentDir", &BlobUtilsSpec_Constants::DocumentDir},
        {L"DownloadDir", &BlobUtilsSpec_Constants::DownloadDir},
        {L"LibraryDir", &BlobUtilsSpec_Constants::LibraryDir},
        {L"MainBundleDir", &BlobUtilsSpec_Constants::MainBundleDir},
        {L"MovieDir", &BlobUtilsSpec_Constants::MovieDir},
        {L"MusicDir", &BlobUtilsSpec_Constants::MusicDir},
        {L"PictureDir", &BlobUtilsSpec_Constants::PictureDir},
        {L"ApplicationSupportDir", &BlobUtilsSpec_Constants::ApplicationSupportDir},
        {L"RingtoneDir", &BlobUtilsSpec_Constants::RingtoneDir},
        {L"SDCardDir", &BlobUtilsSpec_Constants::SDCardDir},
        {L"SDCardApplicationDir", &BlobUtilsSpec_Constants::SDCardApplicationDir},
        {L"DCIMDir", &BlobUtilsSpec_Constants::DCIMDir},
        {L"LegacyDCIMDir", &BlobUtilsSpec_Constants::LegacyDCIMDir},
        {L"LegacyPictureDir", &BlobUtilsSpec_Constants::LegacyPictureDir},
        {L"LegacyMusicDir", &BlobUtilsSpec_Constants::LegacyMusicDir},
        {L"LegacyDownloadDir", &BlobUtilsSpec_Constants::LegacyDownloadDir},
        {L"LegacyMovieDir", &BlobUtilsSpec_Constants::LegacyMovieDir},
        {L"LegacyRingtoneDir", &BlobUtilsSpec_Constants::LegacyRingtoneDir},
        {L"LegacySDCardDir", &BlobUtilsSpec_Constants::LegacySDCardDir},
    };
    return fieldMap;
}

struct BlobUtilsSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto constants = std::tuple{
      TypedConstant<BlobUtilsSpec_Constants>{0},
  };
  static constexpr auto methods = std::tuple{
      Method<void(::React::JSValue, std::string, std::string, std::string, ::React::JSValue, ::React::JSValueArray, Callback<::React::JSValueArray>) noexcept>{0, L"fetchBlobForm"},
      Method<void(::React::JSValue, std::string, std::string, std::string, ::React::JSValue, std::string, Callback<::React::JSValueArray>) noexcept>{1, L"fetchBlob"},
      Method<void(std::string, std::string, std::string, Promise<void>) noexcept>{2, L"createFile"},
      Method<void(std::string, ::React::JSValueArray, Promise<void>) noexcept>{3, L"createFileASCII"},
      Method<void(std::string, Promise<std::string>) noexcept>{4, L"pathForAppGroup"},
      SyncMethod<std::string(std::string) noexcept>{5, L"syncPathAppGroup"},
      Method<void(std::string, Callback<std::vector<bool>>) noexcept>{6, L"exists"},
      Method<void(std::string, std::string, std::string, bool, bool, Promise<double>) noexcept>{7, L"writeFile"},
      Method<void(std::string, ::React::JSValueArray, bool, Promise<double>) noexcept>{8, L"writeFileArray"},
      Method<void(std::string, std::string, bool, Callback<::React::JSValueArray>) noexcept>{9, L"writeStream"},
      Method<void(std::string, ::React::JSValueArray, Callback<::React::JSValueArray>) noexcept>{10, L"writeArrayChunk"},
      Method<void(std::string, std::string, Callback<::React::JSValueArray>) noexcept>{11, L"writeChunk"},
      Method<void(std::string, Callback<::React::JSValueArray>) noexcept>{12, L"closeStream"},
      Method<void(std::string, Callback<::React::JSValueArray>) noexcept>{13, L"unlink"},
      Method<void(::React::JSValueArray, Callback<::React::JSValueArray>) noexcept>{14, L"removeSession"},
      Method<void(std::string, Promise<::React::JSValueArray>) noexcept>{15, L"ls"},
      Method<void(std::string, Callback<::React::JSValueArray>) noexcept>{16, L"stat"},
      Method<void(std::string, Callback<::React::JSValueArray>) noexcept>{17, L"lstat"},
      Method<void(std::string, std::string, Callback<::React::JSValueArray>) noexcept>{18, L"cp"},
      Method<void(std::string, std::string, Callback<::React::JSValueArray>) noexcept>{19, L"mv"},
      Method<void(std::string, Promise<bool>) noexcept>{20, L"mkdir"},
      Method<void(std::string, std::string, bool, Promise<::React::JSValueArray>) noexcept>{21, L"readFile"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{22, L"hash"},
      Method<void(std::string, std::string, double, double, std::string) noexcept>{23, L"readStream"},
      Method<void(Callback<::React::JSValueArray>) noexcept>{24, L"getEnvironmentDirs"},
      Method<void(std::string, Callback<::React::JSValueArray>) noexcept>{25, L"cancelRequest"},
      Method<void(std::string, double, double) noexcept>{26, L"enableProgressReport"},
      Method<void(std::string, double, double) noexcept>{27, L"enableUploadProgressReport"},
      Method<void(std::string, std::string, double, double, Promise<std::string>) noexcept>{28, L"slice"},
      Method<void(std::string, std::string, Promise<::React::JSValueArray>) noexcept>{29, L"presentOptionsMenu"},
      Method<void(std::string, std::string, Promise<::React::JSValueArray>) noexcept>{30, L"presentOpenInMenu"},
      Method<void(std::string, std::string, Promise<::React::JSValueArray>) noexcept>{31, L"presentPreview"},
      Method<void(std::string, Promise<::React::JSValueArray>) noexcept>{32, L"excludeFromBackupKey"},
      Method<void(Callback<::React::JSValueArray>) noexcept>{33, L"df"},
      Method<void(Callback<std::string>) noexcept>{34, L"emitExpiredEvent"},
      Method<void(std::string, std::string, std::string, Promise<void>) noexcept>{35, L"actionViewIntent"},
      Method<void(::React::JSValue, Promise<void>) noexcept>{36, L"addCompleteDownload"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{37, L"copyToInternal"},
      Method<void(::React::JSValue, std::string, std::string, Promise<std::string>) noexcept>{38, L"copyToMediaStore"},
      Method<void(::React::JSValue, std::string, Promise<std::string>) noexcept>{39, L"createMediaFile"},
      Method<void(std::string, std::string, Promise<::React::JSValueArray>) noexcept>{40, L"getBlob"},
      Method<void(std::string, Promise<std::string>) noexcept>{41, L"getContentIntent"},
      Method<void(Promise<std::string>) noexcept>{42, L"getSDCardDir"},
      Method<void(Promise<std::string>) noexcept>{43, L"getSDCardApplicationDir"},
      Method<void(::React::JSValueArray, Callback<::React::JSValueArray>) noexcept>{44, L"scanFile"},
      Method<void(std::string, std::string, bool, Promise<std::string>) noexcept>{45, L"writeToMediaFile"},
      Method<void(std::string) noexcept>{46, L"addListener"},
      Method<void(double) noexcept>{47, L"removeListeners"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto constantCheckResults = CheckConstants<TModule, BlobUtilsSpec>();
    constexpr auto methodCheckResults = CheckMethods<TModule, BlobUtilsSpec>();

    REACT_SHOW_CONSTANT_SPEC_ERRORS(
          0,
          "BlobUtilsSpec_Constants",
          "    REACT_GET_CONSTANTS(GetConstants) BlobUtilsSpec_Constants GetConstants() noexcept {/*implementation*/}\n"
          "    REACT_GET_CONSTANTS(GetConstants) static BlobUtilsSpec_Constants GetConstants() noexcept {/*implementation*/}\n");

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "fetchBlobForm",
          "    REACT_METHOD(fetchBlobForm) void fetchBlobForm(::React::JSValue && options, std::string taskId, std::string method, std::string url, ::React::JSValue && headers, ::React::JSValueArray && form, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(fetchBlobForm) static void fetchBlobForm(::React::JSValue && options, std::string taskId, std::string method, std::string url, ::React::JSValue && headers, ::React::JSValueArray && form, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "fetchBlob",
          "    REACT_METHOD(fetchBlob) void fetchBlob(::React::JSValue && options, std::string taskId, std::string method, std::string url, ::React::JSValue && headers, std::string body, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(fetchBlob) static void fetchBlob(::React::JSValue && options, std::string taskId, std::string method, std::string url, ::React::JSValue && headers, std::string body, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "createFile",
          "    REACT_METHOD(createFile) void createFile(std::string path, std::string data, std::string encoding, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(createFile) static void createFile(std::string path, std::string data, std::string encoding, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "createFileASCII",
          "    REACT_METHOD(createFileASCII) void createFileASCII(std::string path, ::React::JSValueArray && data, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(createFileASCII) static void createFileASCII(std::string path, ::React::JSValueArray && data, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          4,
          "pathForAppGroup",
          "    REACT_METHOD(pathForAppGroup) void pathForAppGroup(std::string groupName, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pathForAppGroup) static void pathForAppGroup(std::string groupName, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          5,
          "syncPathAppGroup",
          "    REACT_SYNC_METHOD(syncPathAppGroup) std::string syncPathAppGroup(std::string groupName) noexcept { /* implementation */ }\n"
          "    REACT_SYNC_METHOD(syncPathAppGroup) static std::string syncPathAppGroup(std::string groupName) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          6,
          "exists",
          "    REACT_METHOD(exists) void exists(std::string path, std::function<void(std::vector<bool> const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(exists) static void exists(std::string path, std::function<void(std::vector<bool> const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          7,
          "writeFile",
          "    REACT_METHOD(writeFile) void writeFile(std::string path, std::string encoding, std::string data, bool transformFile, bool append, ::React::ReactPromise<double> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(writeFile) static void writeFile(std::string path, std::string encoding, std::string data, bool transformFile, bool append, ::React::ReactPromise<double> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          8,
          "writeFileArray",
          "    REACT_METHOD(writeFileArray) void writeFileArray(std::string path, ::React::JSValueArray && data, bool append, ::React::ReactPromise<double> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(writeFileArray) static void writeFileArray(std::string path, ::React::JSValueArray && data, bool append, ::React::ReactPromise<double> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          9,
          "writeStream",
          "    REACT_METHOD(writeStream) void writeStream(std::string path, std::string withEncoding, bool appendData, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(writeStream) static void writeStream(std::string path, std::string withEncoding, bool appendData, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          10,
          "writeArrayChunk",
          "    REACT_METHOD(writeArrayChunk) void writeArrayChunk(std::string streamId, ::React::JSValueArray && withArray, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(writeArrayChunk) static void writeArrayChunk(std::string streamId, ::React::JSValueArray && withArray, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          11,
          "writeChunk",
          "    REACT_METHOD(writeChunk) void writeChunk(std::string streamId, std::string withData, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(writeChunk) static void writeChunk(std::string streamId, std::string withData, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          12,
          "closeStream",
          "    REACT_METHOD(closeStream) void closeStream(std::string streamId, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(closeStream) static void closeStream(std::string streamId, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          13,
          "unlink",
          "    REACT_METHOD(unlink) void unlink(std::string path, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(unlink) static void unlink(std::string path, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          14,
          "removeSession",
          "    REACT_METHOD(removeSession) void removeSession(::React::JSValueArray && paths, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(removeSession) static void removeSession(::React::JSValueArray && paths, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          15,
          "ls",
          "    REACT_METHOD(ls) void ls(std::string path, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(ls) static void ls(std::string path, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          16,
          "stat",
          "    REACT_METHOD(stat) void stat(std::string target, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(stat) static void stat(std::string target, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          17,
          "lstat",
          "    REACT_METHOD(lstat) void lstat(std::string path, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(lstat) static void lstat(std::string path, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          18,
          "cp",
          "    REACT_METHOD(cp) void cp(std::string src, std::string dest, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(cp) static void cp(std::string src, std::string dest, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          19,
          "mv",
          "    REACT_METHOD(mv) void mv(std::string path, std::string dest, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(mv) static void mv(std::string path, std::string dest, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          20,
          "mkdir",
          "    REACT_METHOD(mkdir) void mkdir(std::string path, ::React::ReactPromise<bool> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(mkdir) static void mkdir(std::string path, ::React::ReactPromise<bool> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          21,
          "readFile",
          "    REACT_METHOD(readFile) void readFile(std::string path, std::string encoding, bool transformFile, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(readFile) static void readFile(std::string path, std::string encoding, bool transformFile, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          22,
          "hash",
          "    REACT_METHOD(hash) void hash(std::string path, std::string algorithm, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(hash) static void hash(std::string path, std::string algorithm, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          23,
          "readStream",
          "    REACT_METHOD(readStream) void readStream(std::string path, std::string encoding, double bufferSize, double tick, std::string streamId) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(readStream) static void readStream(std::string path, std::string encoding, double bufferSize, double tick, std::string streamId) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          24,
          "getEnvironmentDirs",
          "    REACT_METHOD(getEnvironmentDirs) void getEnvironmentDirs(std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getEnvironmentDirs) static void getEnvironmentDirs(std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          25,
          "cancelRequest",
          "    REACT_METHOD(cancelRequest) void cancelRequest(std::string taskId, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(cancelRequest) static void cancelRequest(std::string taskId, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          26,
          "enableProgressReport",
          "    REACT_METHOD(enableProgressReport) void enableProgressReport(std::string taskId, double interval, double count) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(enableProgressReport) static void enableProgressReport(std::string taskId, double interval, double count) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          27,
          "enableUploadProgressReport",
          "    REACT_METHOD(enableUploadProgressReport) void enableUploadProgressReport(std::string taskId, double interval, double count) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(enableUploadProgressReport) static void enableUploadProgressReport(std::string taskId, double interval, double count) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          28,
          "slice",
          "    REACT_METHOD(slice) void slice(std::string src, std::string dest, double start, double end, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(slice) static void slice(std::string src, std::string dest, double start, double end, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          29,
          "presentOptionsMenu",
          "    REACT_METHOD(presentOptionsMenu) void presentOptionsMenu(std::string uri, std::string scheme, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(presentOptionsMenu) static void presentOptionsMenu(std::string uri, std::string scheme, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          30,
          "presentOpenInMenu",
          "    REACT_METHOD(presentOpenInMenu) void presentOpenInMenu(std::string uri, std::string scheme, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(presentOpenInMenu) static void presentOpenInMenu(std::string uri, std::string scheme, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          31,
          "presentPreview",
          "    REACT_METHOD(presentPreview) void presentPreview(std::string uri, std::string scheme, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(presentPreview) static void presentPreview(std::string uri, std::string scheme, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          32,
          "excludeFromBackupKey",
          "    REACT_METHOD(excludeFromBackupKey) void excludeFromBackupKey(std::string url, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(excludeFromBackupKey) static void excludeFromBackupKey(std::string url, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          33,
          "df",
          "    REACT_METHOD(df) void df(std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(df) static void df(std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          34,
          "emitExpiredEvent",
          "    REACT_METHOD(emitExpiredEvent) void emitExpiredEvent(std::function<void(std::string)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(emitExpiredEvent) static void emitExpiredEvent(std::function<void(std::string)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          35,
          "actionViewIntent",
          "    REACT_METHOD(actionViewIntent) void actionViewIntent(std::string path, std::string mime, std::string chooserTitle, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(actionViewIntent) static void actionViewIntent(std::string path, std::string mime, std::string chooserTitle, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          36,
          "addCompleteDownload",
          "    REACT_METHOD(addCompleteDownload) void addCompleteDownload(::React::JSValue && config, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(addCompleteDownload) static void addCompleteDownload(::React::JSValue && config, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          37,
          "copyToInternal",
          "    REACT_METHOD(copyToInternal) void copyToInternal(std::string contentUri, std::string destpath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(copyToInternal) static void copyToInternal(std::string contentUri, std::string destpath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          38,
          "copyToMediaStore",
          "    REACT_METHOD(copyToMediaStore) void copyToMediaStore(::React::JSValue && filedata, std::string mt, std::string path, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(copyToMediaStore) static void copyToMediaStore(::React::JSValue && filedata, std::string mt, std::string path, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          39,
          "createMediaFile",
          "    REACT_METHOD(createMediaFile) void createMediaFile(::React::JSValue && filedata, std::string mt, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(createMediaFile) static void createMediaFile(::React::JSValue && filedata, std::string mt, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          40,
          "getBlob",
          "    REACT_METHOD(getBlob) void getBlob(std::string contentUri, std::string encoding, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getBlob) static void getBlob(std::string contentUri, std::string encoding, ::React::ReactPromise<::React::JSValueArray> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          41,
          "getContentIntent",
          "    REACT_METHOD(getContentIntent) void getContentIntent(std::string mime, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getContentIntent) static void getContentIntent(std::string mime, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          42,
          "getSDCardDir",
          "    REACT_METHOD(getSDCardDir) void getSDCardDir(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getSDCardDir) static void getSDCardDir(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          43,
          "getSDCardApplicationDir",
          "    REACT_METHOD(getSDCardApplicationDir) void getSDCardApplicationDir(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getSDCardApplicationDir) static void getSDCardApplicationDir(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          44,
          "scanFile",
          "    REACT_METHOD(scanFile) void scanFile(::React::JSValueArray && pairs, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(scanFile) static void scanFile(::React::JSValueArray && pairs, std::function<void(::React::JSValueArray const &)> const & callback) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          45,
          "writeToMediaFile",
          "    REACT_METHOD(writeToMediaFile) void writeToMediaFile(std::string fileUri, std::string path, bool transformFile, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(writeToMediaFile) static void writeToMediaFile(std::string fileUri, std::string path, bool transformFile, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          46,
          "addListener",
          "    REACT_METHOD(addListener) void addListener(std::string eventName) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(addListener) static void addListener(std::string eventName) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          47,
          "removeListeners",
          "    REACT_METHOD(removeListeners) void removeListeners(double count) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(removeListeners) static void removeListeners(double count) noexcept { /* implementation */ }\n");
  }
};

} // namespace ReactNativeBlobUtilCodegen

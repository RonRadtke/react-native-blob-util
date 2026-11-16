//
//  ReactNativeBlobUtilMediaLibrary.swift
//  ReactNativeBlobUtil
//
//  media.copyToInternal() on iOS: a photo library item copied into the app's
//  own storage. Android reads a content:// URI through its ContentResolver;
//  the iOS equivalent is a PHAsset, named either as "ph://<local identifier>"
//  or as one of the older "assets-library://" URLs, and read through Photos.
//
//  An asset is not a file. Its bytes live in a store the app cannot open by
//  path, may still be in iCloud, and for an edited photo the "original" and
//  what the user sees are different resources - so every path here goes through
//  PHAssetResourceManager or PHImageManager rather than FileManager.
//

import Foundation
import UIKit
import Photos

final class ReactNativeBlobUtilMediaLibrary {

    /// The scheme the New Architecture era uses: PHAsset.localIdentifier, which
    /// is what `stat` and the image pickers hand out.
    static let phPrefix = "ph://"

    /// The size an image is drawn at for the requested bounds: the largest size
    /// that fits inside them with the aspect ratio kept, and never larger than
    /// the original. A bound that is not given does not constrain anything.
    ///
    /// Pure, and tested as such - the arithmetic is the part that silently goes
    /// wrong (an upscale, a squashed aspect ratio), not the Photos plumbing.
    static func fittedSize(_ size: CGSize, width: Int?, height: Int?) -> CGSize {
        guard size.width > 0, size.height > 0 else { return size }
        var scale = 1.0
        if let width = width, width > 0 {
            scale = min(scale, Double(width) / Double(size.width))
        }
        if let height = height, height > 0 {
            scale = min(scale, Double(height) / Double(size.height))
        }
        // Never upscale: asking for 4000px of a 100px thumbnail cannot produce
        // detail that was never captured, and the file would only get bigger.
        guard scale < 1 else { return size }
        // At least one pixel each way; rounding a very aggressive scale down to
        // zero would make an image UIKit cannot draw.
        return CGSize(width: max(1, (size.width * scale).rounded()),
                      height: max(1, (size.height * scale).rounded()))
    }

    /// `data` re-encoded as JPEG, scaled down to fit the bounds. Nil when the
    /// bytes are not an image UIKit can read.
    static func jpeg(from data: Data, width: Int?, height: Int?, compression: Double) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let target = fittedSize(image.size, width: width, height: height)
        let quality = min(max(compression, 0), 1)
        if target == image.size {
            return image.jpegData(compressionQuality: quality)
        }
        let format = UIGraphicsImageRendererFormat.default()
        // Points, not pixels: the renderer would otherwise multiply the target
        // by the screen's scale and write an image larger than was asked for.
        format.scale = 1
        let scaled = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return scaled.jpegData(compressionQuality: quality)
    }

    /// Copies the asset `uri` names to `destpath`, overwriting what is there.
    static func copyToInternal(_ uri: String,
                               destpath: String,
                               options: [String: Any],
                               resolve: @escaping RNBUResolve,
                               reject: @escaping RNBUReject) {
        let width = (options["width"] as? NSNumber)?.intValue
        let height = (options["height"] as? NSNumber)?.intValue
        let compression = (options["compression"] as? NSNumber)?.doubleValue
        // 0.9 rather than 1.0: a re-encode at full quality is larger than the
        // original JPEG it came from, which is the opposite of what a caller
        // passing width and height is asking for.
        let quality = compression ?? 0.9
        let resize = width != nil || height != nil || compression != nil

        guard authorized() else {
            return reject("EACCES", "The app is not allowed to read the photo library", nil)
        }
        guard let asset = asset(for: uri) else {
            return reject("ENOENT", "No photo library item at '\(uri)'", nil)
        }
        let parent = (destpath as NSString).deletingLastPathComponent
        var parentIsDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: parent, isDirectory: &parentIsDir),
              parentIsDir.boolValue else {
            return reject("ENOENT", "Cannot create the directory of '\(destpath)'", nil)
        }

        if asset.mediaType == .video {
            // A video is never re-encoded: the options describe an image, and
            // transcoding one here would be a different operation with a
            // different cost. The original resource is written as it is.
            writeResource(of: asset, to: destpath, resolve: resolve, reject: reject)
            return
        }

        guard resize else {
            writeResource(of: asset, to: destpath, resolve: resolve, reject: reject)
            return
        }

        imageData(of: asset) { data in
            guard let data = data else {
                return reject("EUNSPECIFIED", "Could not read the image data of '\(uri)'", nil)
            }
            guard let encoded = jpeg(from: data, width: width, height: height, compression: quality) else {
                return reject("EUNSPECIFIED", "Could not re-encode '\(uri)' as JPEG", nil)
            }
            do {
                try encoded.write(to: URL(fileURLWithPath: destpath), options: .atomic)
                resolve(nil)
            } catch let error as NSError {
                reject("EUNSPECIFIED", error.localizedDescription, nil)
            }
        }
    }

    // MARK: - Photos plumbing

    /// Whether the library may be read at all. `.notDetermined` is not an
    /// outright no, but asking here would put a system alert in front of a file
    /// copy; the app decides when to prompt, so an unasked permission is
    /// reported as the refusal it currently is.
    private static func authorized() -> Bool {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized, .limited: return true
        default: return false
        }
    }

    private static func asset(for uri: String) -> PHAsset? {
        if uri.hasPrefix(phPrefix) {
            let identifier = String(uri.dropFirst(phPrefix.count))
            guard !identifier.isEmpty else { return nil }
            return PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject
        }
        if uri.hasPrefix(ReactNativeBlobUtilConst.alPrefix) {
            guard let url = URL(string: uri) else { return nil }
            return PHAsset.fetchAssets(withALAssetURLs: [url], options: nil).firstObject
        }
        return nil
    }

    /// The asset's own bytes, written straight to `destpath`.
    private static func writeResource(of asset: PHAsset,
                                      to destpath: String,
                                      resolve: @escaping RNBUResolve,
                                      reject: @escaping RNBUReject) {
        guard let resource = resource(of: asset) else {
            // No resource at all is possible for an asset the library knows
            // about but holds no data for.
            if asset.mediaType == .image {
                return imageData(of: asset) { data in
                    guard let data = data else {
                        return reject("EUNSPECIFIED", "Could not read the data of the asset", nil)
                    }
                    do {
                        try data.write(to: URL(fileURLWithPath: destpath), options: .atomic)
                        resolve(nil)
                    } catch let error as NSError {
                        reject("EUNSPECIFIED", error.localizedDescription, nil)
                    }
                }
            }
            return reject("ENOENT", "The asset holds no data to copy", nil)
        }

        // writeData refuses an existing destination, and the call overwrites.
        try? FileManager.default.removeItem(atPath: destpath)
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        PHAssetResourceManager.default().writeData(for: resource,
                                                   toFile: URL(fileURLWithPath: destpath),
                                                   options: options) { error in
            if let error = error as NSError? {
                reject("EUNSPECIFIED", error.localizedDescription, nil)
            } else {
                resolve(nil)
            }
        }
    }

    /// The original resource, preferring it over an edited rendition.
    private static func resource(of asset: PHAsset) -> PHAssetResource? {
        let resources = PHAssetResource.assetResources(for: asset)
        let original: PHAssetResourceType = asset.mediaType == .video ? .video : .photo
        let edited: PHAssetResourceType = asset.mediaType == .video ? .fullSizeVideo : .fullSizePhoto
        return resources.first { $0.type == original }
            ?? resources.first { $0.type == edited }
            ?? resources.first
    }

    private static func imageData(of asset: PHAsset, onComplete: @escaping (Data?) -> Void) {
        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .none
        options.isNetworkAccessAllowed = true
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
            onComplete(data)
        }
    }
}

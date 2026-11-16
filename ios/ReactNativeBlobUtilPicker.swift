//
//  ReactNativeBlobUtilPicker.swift
//  ReactNativeBlobUtil
//
//  The system file picker behind open.pick(). Android answers with a content://
//  URI its provider can read; iOS has no equivalent, so the picker is asked for
//  a copy (asCopy: true) and the call answers with the path of that copy, which
//  lives in the app's own temporary directory and needs no permission to read.
//
//  Nothing here imports React. The controller to present from comes in as a
//  provider closure, the same way the document menus get theirs.
//

import Foundation
import UIKit
import UniformTypeIdentifiers

final class ReactNativeBlobUtilPicker: NSObject, UIDocumentPickerDelegate {

    /// The promise of the picker currently on screen. Its presence is the
    /// "already picking" flag: UIKit will happily present a second picker over
    /// the first, and the first promise would then never settle.
    private var pending: (resolve: RNBUResolve, reject: RNBUReject)?
    private let lock = NSLock()

    /// How the picker reaches the screen, and whether it got there. The default
    /// presents it from the provider's controller; the tests substitute their
    /// own, because presenting real UIKit from a unit test leaves the host in a
    /// state the tests that run after it inherit.
    var present: ((UIDocumentPickerViewController) -> Bool)?

    /// The content types a list of MIME types asks for.
    ///
    /// The wildcards are mapped by hand on purpose. UTType(mimeType:) does not
    /// return nil for an unknown type - it synthesises a dynamic identifier, so
    /// "image/*" becomes `dyn.ah62d4rv4gq80w5pbq7ww8nu`, a type nothing on disk
    /// declares and the picker therefore matches nothing against. Measured on
    /// Xcode 26.5; the same is true of "*/*".
    ///
    /// An exact type keeps whatever UTType makes of it, dynamic included: a
    /// caller asking for a MIME type no installed app declares has asked for
    /// something that matches nothing, and quietly widening that to every file
    /// would be answering a different question.
    static func contentTypes(for mimeTypes: [String]) -> [UTType] {
        var types: [UTType] = []
        for mime in mimeTypes {
            let lowered = mime.lowercased()
            let mapped: UTType?
            switch lowered {
            case "*/*": mapped = .item
            case "image/*": mapped = .image
            case "video/*": mapped = .movie
            case "audio/*": mapped = .audio
            case "text/*": mapped = .text
            default:
                // Any other wildcard ("model/*", "font/*") has no single type
                // that stands for it, so it widens to every file rather than
                // filtering to nothing.
                mapped = lowered.hasSuffix("/*") ? .item : UTType(mimeType: lowered)
            }
            if let mapped = mapped, !types.contains(mapped) {
                types.append(mapped)
            }
        }
        // Not "every type was nil" - an empty `mimeTypes` lands here too, and a
        // picker with no content types at all opens showing nothing.
        return types.isEmpty ? [.item] : types
    }

    /// Opens the picker and settles with the paths of the copies it made.
    func pick(mimeTypes: [String],
              multiple: Bool,
              from presenting: (() -> UIViewController?)?,
              resolve: @escaping RNBUResolve,
              reject: @escaping RNBUReject) {
        lock.lock()
        if pending != nil {
            lock.unlock()
            return reject("EBUSY", "A file picker is already open", nil)
        }
        pending = (resolve, reject)
        lock.unlock()

        let controller = UIDocumentPickerViewController(
            forOpeningContentTypes: Self.contentTypes(for: mimeTypes), asCopy: true)
        controller.allowsMultipleSelection = multiple
        controller.delegate = self

        DispatchQueue.main.async {
            if let present = self.present {
                if !present(controller) {
                    self.settle { _, reject in
                        reject("EUNSPECIFIED", "Could not present the file picker", nil)
                    }
                }
                return
            }
            guard let host = presenting?() else {
                // Without a controller the picker cannot be presented at all,
                // and leaving the promise pending would also wedge every later
                // call behind the EBUSY check above.
                self.settle { _, reject in
                    reject("EUNSPECIFIED", "No view controller to present the file picker from", nil)
                }
                return
            }
            host.present(controller, animated: true)
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        settle { resolve, _ in resolve(urls.map { $0.path }) }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        // A cancel is not an error: the user answered the question with
        // "nothing". JS turns the empty list into null for a single pick.
        settle { resolve, _ in resolve([]) }
    }

    /// Settles the pending promise exactly once and clears the flag. UIKit can
    /// call a delegate method after the controller is already gone, and the
    /// promise must not be settled twice.
    private func settle(_ finish: (RNBUResolve, RNBUReject) -> Void) {
        lock.lock()
        let promise = pending
        pending = nil
        lock.unlock()
        guard let promise = promise else { return }
        finish(promise.resolve, promise.reject)
    }
}

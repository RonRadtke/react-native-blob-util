// @flow
// Opening files in other apps and picking files: one namespace, whatever the
// platform does underneath. A call a platform cannot make rejects with ENOTSUP.

import {Platform} from 'react-native';
import {addCode} from './utils/errors';
import {extensionsForMime} from './utils/mime';
import {requireNativeModule} from './utils/nativeModule';
import {notSupported} from './utils/platform';

type OpenOptions = {mime?: string, scheme?: string, title?: string};

function checkPath(path: string): ?Error {
    return typeof path === 'string' ? null : addCode('EINVAL', new TypeError('Missing argument "path" '));
}

// iOS takes a file URL. A path that already is one was prefixed a second time.
function fileUrl(path: string): string {
    return path.startsWith('file://') ? path : 'file://' + path;
}

/**
 * Open a file in another app: Android shows the default app for its MIME type
 * (an ACTION_VIEW intent), iOS shows a full-screen preview
 * (UIDocumentInteractionController.presentPreview).
 * @param  {string} path Path of the file, without a scheme.
 * @param  {{mime?: string, scheme?: string}} options `mime` is used on Android, `scheme` on iOS.
 * @return {Promise<void>}
 */
function file(path: string, options: OpenOptions = {}): Promise<void> {
    const invalid = checkPath(path);
    if (invalid) return Promise.reject(invalid);
    switch (Platform.OS) {
        case 'android':
            return requireNativeModule().actionViewIntent(path, options.mime || '', null).then(() => undefined);
        case 'ios':
            return requireNativeModule().presentPreview(fileUrl(path), options.scheme).then(() => undefined);
        default:
            return Promise.reject(notSupported('android or iOS', 'ReactNativeBlobUtil.open.file'));
    }
}

/**
 * Let the user choose the app that opens the file: an app chooser on Android,
 * the "open in" menu on iOS.
 * @param  {string} path Path of the file, without a scheme.
 * @param  {{mime?: string, scheme?: string, title?: string}} options `title` is the chooser title on Android.
 * @return {Promise<void>}
 */
function chooser(path: string, options: OpenOptions = {}): Promise<void> {
    const invalid = checkPath(path);
    if (invalid) return Promise.reject(invalid);
    switch (Platform.OS) {
        case 'android':
            return requireNativeModule().actionViewIntent(path, options.mime || '', options.title || 'Open with').then(() => undefined);
        case 'ios':
            return requireNativeModule().presentOpenInMenu(fileUrl(path), options.scheme).then(() => undefined);
        default:
            return Promise.reject(notSupported('android or iOS', 'ReactNativeBlobUtil.open.chooser'));
    }
}

/**
 * The iOS options menu for a file (UIDocumentInteractionController.presentOptionsMenu).
 * @return {Promise<void>}
 */
function optionsMenu(path: string, options: OpenOptions = {}): Promise<void> {
    const invalid = checkPath(path);
    if (invalid) return Promise.reject(invalid);
    if (Platform.OS !== 'ios') {
        return Promise.reject(notSupported('ios', 'ReactNativeBlobUtil.open.optionsMenu'));
    }
    return requireNativeModule().presentOptionsMenu(fileUrl(path), options.scheme).then(() => undefined);
}

type PickOptions = {mime?: string | Array<string>, multiple?: boolean};

/**
 * Show the system file picker. Resolves what the user picked: on Android a
 * content:// URI, which the fs calls and requests read through its provider;
 * on iOS and Windows the path of a copy in the app's temporary directory,
 * since the original is outside the app's own storage. With `multiple` it
 * resolves a list, [] when the user cancels; otherwise one entry, or null.
 * @param  {string | string[] | {mime?: string | string[], multiple?: boolean}} mimeOrOptions
 *         MIME types to offer, such as "image/*" or "application/pdf"; default any.
 * @return {Promise<?string | Array<string>>}
 */
function pick(mimeOrOptions: string | Array<string> | PickOptions = '*/*'): Promise<any> {
    const options: PickOptions = mimeOrOptions !== null && typeof mimeOrOptions === 'object' && !Array.isArray(mimeOrOptions)
        ? mimeOrOptions
        : {mime: (mimeOrOptions: any)};
    const given = options.mime === undefined || options.mime === null || options.mime === '' ? ['*/*'] : options.mime;
    const mime = Array.isArray(given) ? given : [given];
    if (mime.length === 0 || mime.some((type) => typeof type !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(type))) {
        return Promise.reject(addCode('EINVAL', new TypeError('"mime" must be a MIME type such as "image/*", or a list of them')));
    }
    const multiple = Boolean(options.multiple);
    // The Windows picker filters by extension; JS turns the types into them,
    // so the table is in one place and unit-tested.
    const request = Platform.OS === 'windows' ? {mime, multiple, extensions: extensionsForMime(mime)} : {mime, multiple};
    return requireNativeModule().pickFiles(request).then((picked) => {
        const list = Array.isArray(picked) ? picked : [];
        if (multiple) {
            return list;
        }
        return list.length > 0 ? list[0] : null;
    });
}

export default {file, chooser, optionsMenu, pick};

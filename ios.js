// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

import {Platform} from 'react-native';
import {deprecatedAlias} from './utils/deprecate';
import {requireNativeModule} from './utils/nativeModule';
import {platformOnly} from './utils/platform';

// Every call here rejects with ENOTSUP on other platforms.
const iosOnly = (name, fn) => platformOnly('ios', `ReactNativeBlobUtil.ios.${name}`, fn);

/**
 * Displays an options menu using UIDocumentInteractionController.presentOptionsMenu
 * @param  {string} path Path of the file to be open.
 * @param  {string} scheme URI scheme that needs to support, optional
 * @return {Promise<void>}
 */
const presentOptionsMenu = iosOnly('presentOptionsMenu', (path: string, scheme: ?string) => {
    return requireNativeModule().presentOptionsMenu('file://' + path, scheme).then(() => undefined);
});

/**
 * Displays a menu for opening the document using UIDocumentInteractionController.presentOpenInMenu
 * @param  {string} path Path of the file to be open.
 * @param  {string} scheme URI scheme that needs to support, optional
 * @return {Promise<void>}
 */
const presentOpenInMenu = iosOnly('presentOpenInMenu', (path: string, scheme: ?string) => {
    return requireNativeModule().presentOpenInMenu('file://' + path, scheme).then(() => undefined);
});

/**
 * Displays a full-screen preview of the target document using UIDocumentInteractionController.presentPreview
 * @param  {string} path Path of the file to be open.
 * @param  {string} scheme URI scheme that needs to support, optional
 * @return {Promise<void>}
 */
const presentPreview = iosOnly('presentPreview', (path: string, scheme: ?string) => {
    return requireNativeModule().presentPreview('file://' + path, scheme).then(() => undefined);
});

/**
 * Set excludeFromBackupKey to a URL to prevent the resource to be backuped to
 * iCloud.
 * @param  {string} path Path of the file, only file paths are supported
 * @return {Promise<void>}
 */
const excludeFromBackupKey = iosOnly('excludeFromBackupKey', (path: string) => {
    return requireNativeModule().excludeFromBackupKey('file://' + path).then(() => undefined);
});

/**
 * Returns the path for the app group.
 * @param  {string} groupName Name of app group
 * @return {Promise<string>}
 */
const pathForAppGroup = iosOnly('pathForAppGroup', (groupName: string) => {
    return requireNativeModule().pathForAppGroup(groupName);
});

/**
 * Returns the path for the app group synchronously; '' on other platforms.
 * @param  {string} groupName Name of app group
 * @return {string} Path of App Group dir
 */
function syncPathAppGroup(groupName: string): string {
    if (Platform.OS === 'ios') {
        return requireNativeModule().syncPathAppGroup(groupName);
    }
    return '';
}

export default {
    presentOptionsMenu,
    presentOpenInMenu,
    presentPreview,
    excludeFromBackupKey,
    pathForAppGroup,
    syncPathAppGroup,
    // Legacy names. They used to point at each other's implementation.
    openDocument: deprecatedAlias('ios.openDocument', 'ios.presentOptionsMenu', presentOptionsMenu),
    previewDocument: deprecatedAlias('ios.previewDocument', 'ios.presentPreview', presentPreview),
};

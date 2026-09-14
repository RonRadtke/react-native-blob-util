// The names from before 1.0. Each warns once and forwards to media.*.
import media from './media';
import {deprecatedAlias} from './utils/deprecate';

const alias = (name, target, fn) => deprecatedAlias(`MediaCollection.${name}`, `media.${target}`, fn);

export default {
    createMediaFile: alias('createMediaFile', 'createFile', media.createFile),
    createMediafile: alias('createMediafile', 'createFile', media.createFile),
    writeToMediaFile: alias('writeToMediaFile', 'write', (uri: string, path: string) => media.write(uri, path)),
    writeToMediafile: alias('writeToMediafile', 'write', (uri: string, path: string) => media.write(uri, path)),
    writeToMediaFileWithTransform: alias('writeToMediaFileWithTransform', 'write(uri, path, {transform: true})',
        (uri: string, path: string) => media.write(uri, path, {transform: true})),
    writeToMediafileWithTransform: alias('writeToMediafileWithTransform', 'write(uri, path, {transform: true})',
        (uri: string, path: string) => media.write(uri, path, {transform: true})),
    copyToInternal: alias('copyToInternal', 'copyToInternal', media.copyToInternal),
    getBlob: alias('getBlob', 'read', media.read),
    copyToMediaStore: alias('copyToMediaStore', 'copyToMediaStore', media.copyToMediaStore),
};

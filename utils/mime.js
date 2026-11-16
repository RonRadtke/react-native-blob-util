// @flow
/**
 * File extensions for MIME types, for the Windows file picker: it filters by
 * extension where Android and iOS take MIME types.
 */

const BY_TYPE: {[string]: Array<string>} = {
    'application/json': ['.json'],
    'application/msword': ['.doc'],
    'application/pdf': ['.pdf'],
    'application/rtf': ['.rtf'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.ms-powerpoint': ['.ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/xml': ['.xml'],
    'application/zip': ['.zip'],
    'application/gzip': ['.gz'],
    'audio/aac': ['.aac'],
    'audio/flac': ['.flac'],
    'audio/mp4': ['.m4a'],
    'audio/mpeg': ['.mp3'],
    'audio/ogg': ['.ogg', '.oga'],
    'audio/wav': ['.wav'],
    'audio/x-wav': ['.wav'],
    'image/bmp': ['.bmp'],
    'image/gif': ['.gif'],
    'image/heic': ['.heic'],
    'image/heif': ['.heif'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/svg+xml': ['.svg'],
    'image/tiff': ['.tif', '.tiff'],
    'image/webp': ['.webp'],
    'text/csv': ['.csv'],
    'text/html': ['.html', '.htm'],
    'text/markdown': ['.md'],
    'text/plain': ['.txt'],
    'text/xml': ['.xml'],
    'video/mp4': ['.mp4', '.m4v'],
    'video/mpeg': ['.mpeg', '.mpg'],
    'video/quicktime': ['.mov'],
    'video/webm': ['.webm'],
    'video/x-msvideo': ['.avi'],
};

/** Every extension a top-level type ("image/*") covers: the ones listed for it. */
function forTopLevel(top: string): Array<string> {
    const out = [];
    for (const type of Object.keys(BY_TYPE)) {
        if (type.startsWith(top + '/')) {
            out.push(...BY_TYPE[type]);
        }
    }
    return out;
}

/**
 * The extensions the Windows picker offers for a list of MIME types, or ["*"]
 * (any file) when one of them is a wildcard for everything or not known here:
 * offering too much beats hiding the file the user is after.
 * @param  {Array<string>} mimes
 * @return {Array<string>}
 */
export function extensionsForMime(mimes: Array<string>): Array<string> {
    const out = new Set();
    for (const raw of mimes) {
        const mime = raw.toLowerCase().split(';')[0].trim();
        const [top, sub] = mime.split('/');
        const found = sub === '*' ? forTopLevel(top) : BY_TYPE[mime] || [];
        if (found.length === 0) {
            return ['*'];
        }
        for (const ext of found) {
            out.add(ext);
        }
    }
    return out.size > 0 ? [...out] : ['*'];
}

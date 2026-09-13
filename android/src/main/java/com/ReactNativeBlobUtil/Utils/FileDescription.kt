package com.ReactNativeBlobUtil.Utils

class FileDescription(n: String?, mT: String?, pF: String?) {
    @JvmField var name: String? = n
    @JvmField var partentFolder: String = pF ?: ""
    @JvmField var mimeType: String? = mT

    // Java concatenation writes a null file name as "null"; so does the template.
    val fullPath: String
        get() = "$partentFolder/${MimeType.getFullFileName(name, mimeType)}"
}

package com.ReactNativeBlobUtil.Utils

import android.webkit.MimeTypeMap

class MimeType {

    companion object {
        internal const val UNKNOWN = "*/*"
        internal const val BINARY_FILE = "application/octet-stream"
        internal const val IMAGE = "image/*"
        internal const val AUDIO = "audio/*"
        internal const val VIDEO = "video/*"
        internal const val TEXT = "text/*"
        internal const val FONT = "font/*"
        internal const val APPLICATION = "application/*"
        internal const val CHEMICAL = "chemical/*"
        internal const val MODEL = "model/*"

        /**
         * * Given `name` = `ABC` AND `mimeType` = `video/mp4`, then return `ABC.mp4`
         * * Given `name` = `ABC` AND `mimeType` = `null`, then return `ABC`
         * * Given `name` = `ABC.mp4` AND `mimeType` = `video/mp4`, then return `ABC.mp4`
         *
         * @param name can have file extension or not
         */
        @JvmStatic
        fun getFullFileName(name: String?, mimeType: String?): String? {
            // Prior to API 29, MimeType.BINARY_FILE has no file extension
            val ext = getExtensionFromMimeType(mimeType)
            // A null name with a known extension throws here, as the Java version did.
            if (ext.isNullOrEmpty() || name!!.endsWith(".$ext")) return name
            val fn = "$name.$ext"
            return if (fn.endsWith(".")) fn.trimEnd('.') else fn
        }

        /**
         * Some mime types return no file extension on older API levels. This function adds compatibility accross API levels.
         *
         * @see getExtensionFromMimeTypeOrFileName
         */
        @JvmStatic
        fun getExtensionFromMimeType(mimeType: String?): String? {
            return if (mimeType != null) {
                if (mimeType == BINARY_FILE) "bin" else MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
            } else {
                ""
            }
        }

        /**
         * @see getExtensionFromMimeType
         */
        @JvmStatic
        fun getExtensionFromMimeTypeOrFileName(mimeType: String?, filename: String?): String? {
            // commons-lang3 substringAfterLast: null stays null, no separator gives "".
            return if (mimeType == null || mimeType == UNKNOWN) filename?.substringAfterLast('.', "") else getExtensionFromMimeType(mimeType)
        }

        /**
         * Some file types return no mime type on older API levels. This function adds compatibility across API levels.
         */
        @JvmStatic
        fun getMimeTypeFromExtension(fileExtension: String): String {
            if (fileExtension == "bin") return BINARY_FILE
            return MimeTypeMap.getSingleton().getMimeTypeFromExtension(fileExtension) ?: UNKNOWN
        }
    }
}

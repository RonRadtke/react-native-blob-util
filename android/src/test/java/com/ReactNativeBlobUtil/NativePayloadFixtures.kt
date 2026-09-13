package com.ReactNativeBlobUtil

import org.json.JSONObject
import java.io.File

/**
 * Reads the payload fixtures in tests/fixtures/native-payloads, which the JS unit
 * tests read too. Gradle passes the directory as the blobUtilFixtures system
 * property (see android/build.gradle), so the tests do not depend on the working
 * directory they happen to run in.
 */
object NativePayloadFixtures {

    private val directory: File by lazy {
        val configured = System.getProperty("blobUtilFixtures")
            ?: error("blobUtilFixtures is not set - run the tests through Gradle (npm run test:android)")
        File(configured, "native-payloads").also {
            check(it.isDirectory) { "native payload fixtures not found at ${it.absolutePath}" }
        }
    }

    /** The cases of one fixture file that describe [platform], optionally only its current shape. */
    fun cases(name: String, platform: String = "android", currentOnly: Boolean = true): List<JSONObject> {
        val root = JSONObject(File(directory, "$name.json").readText())
        val all = root.getJSONArray("cases")
        return (0 until all.length())
            .map { all.getJSONObject(it) }
            .filter { it.getString("platform") == platform }
            .filter { !currentOnly || !it.has("current") || it.getBoolean("current") }
    }
}

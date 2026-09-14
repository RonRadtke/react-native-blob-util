package com.ReactNativeBlobUtil

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The fixtures in tests/fixtures/native-payloads are the contract between the
 * native layers and the JS normalisers. This proves the JVM tests can read them
 * from wherever Gradle runs, and that what they say about Android is the shape the
 * Android code emits today. Payload builders get their own tests as they are
 * ported; each one asserts against these same files.
 */
class NativePayloadFixturesTest {

    @Test
    fun `the progress fixture describes Android byte counts as numbers`() {
        val cases = NativePayloadFixtures.cases("progress-event")
        assertTrue("no current Android progress cases in the fixture", cases.isNotEmpty())
        for (case in cases) {
            assertTrue("written must be a number: $case", case.get("written") is Number)
            assertTrue("total must be a number: $case", case.get("total") is Number)
        }
    }

    @Test
    fun `the exists fixture describes Android as resolving exists and isDirectory booleans`() {
        val cases = NativePayloadFixtures.cases("exists-result")
        assertTrue("no Android exists cases in the fixture", cases.isNotEmpty())
        for (case in cases) {
            val result = case.getJSONObject("result")
            assertTrue("exactly the two keys: $case", result.keys().asSequence().toSet() == setOf("exists", "isDirectory"))
            assertTrue("both are booleans: $case", result.get("exists") is Boolean && result.get("isDirectory") is Boolean)
        }
    }
}

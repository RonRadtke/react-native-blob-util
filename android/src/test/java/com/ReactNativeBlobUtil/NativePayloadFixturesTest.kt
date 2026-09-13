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
    fun `the exists fixture describes Android as passing two booleans`() {
        val cases = NativePayloadFixtures.cases("exists-callback")
        assertTrue("no Android exists cases in the fixture", cases.isNotEmpty())
        for (case in cases) {
            val args = case.getJSONArray("args")
            assertTrue("Android passes exactly two arguments: $case", args.length() == 2)
            assertTrue("both arguments are booleans: $case", args.get(0) is Boolean && args.get(1) is Boolean)
        }
    }
}

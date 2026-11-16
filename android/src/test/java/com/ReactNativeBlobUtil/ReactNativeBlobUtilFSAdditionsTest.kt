package com.ReactNativeBlobUtil

import com.facebook.react.bridge.Promise
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.File
import java.lang.reflect.Proxy

/**
 * The 1.2.0 file-system additions that stay on java.io: reading and writing a
 * byte range, touch, copying a directory, the destination checks of cp and mv,
 * the decoding of file:// paths, the picker's intent type and the image scaling
 * arithmetic. Assets, resources and content URIs need a device and are covered
 * by the parity cases.
 */
class ReactNativeBlobUtilFSAdditionsTest {

    @get:Rule
    val tmp = TemporaryFolder()

    /** The path as the library sees it on every host; see ReactNativeBlobUtilFSTest. */
    private val File.plain: String
        get() = absolutePath.replace('\\', '/').replaceFirst(Regex("^[A-Za-z]:"), "")

    private class Settled(val method: String, val args: List<Any?>)

    private class RecordingPromise {
        val calls = mutableListOf<Settled>()
        val promise = Proxy.newProxyInstance(Promise::class.java.classLoader, arrayOf(Promise::class.java)) { _, method, args ->
            calls.add(Settled(method.name, args?.toList().orEmpty()))
            null
        } as Promise

        fun resolved(): Any? {
            assertEquals("settled once", 1, calls.size)
            assertEquals("resolve", calls[0].method)
            return calls[0].args.single()
        }

        fun code(): Any? {
            assertEquals("settled once", 1, calls.size)
            assertEquals("reject", calls[0].method)
            return calls[0].args[0]
        }
    }

    private fun bytes(vararg values: Int) = ByteArray(values.size) { values[it].toByte() }

    // decodePercent and normalizePath (#287)

    @Test
    fun `decodePercent decodes UTF-8 escapes and leaves a plus alone`() {
        assertEquals("/a b#1/é+x", ReactNativeBlobUtilUtils.decodePercent("/a%20b%231/%C3%A9+x"))
        assertEquals("/emoji 😀", ReactNativeBlobUtilUtils.decodePercent("/emoji%20%F0%9F%98%80"))
        assertEquals("/plain/😀 a", ReactNativeBlobUtilUtils.decodePercent("/plain/😀 a"))
    }

    @Test
    fun `decodePercent leaves a malformed escape or bytes that are not UTF-8 undecoded`() {
        for (value in listOf("/100%", "/a%2", "/a%G1", "/a%FF%FE", "/%C3")) {
            assertEquals(value, ReactNativeBlobUtilUtils.decodePercent(value))
        }
    }

    @Test
    fun `normalizePath decodes a file URI, as Android 7 to 9 hand them out (#287)`() {
        assertEquals("/sdcard/My Photo.jpg", ReactNativeBlobUtilUtils.normalizePath("file:///sdcard/My%20Photo.jpg"))
        assertEquals("/sdcard/a%20b.jpg", ReactNativeBlobUtilUtils.normalizePath("/sdcard/a%20b.jpg"))
        assertEquals("bundle-res://raw/x", ReactNativeBlobUtilUtils.normalizePath("bundle-res://raw/x"))
        assertNull(ReactNativeBlobUtilUtils.normalizePath("content://media/1"))
    }

    @Test
    fun `resourceName splits type and name and refuses anything else`() {
        assertEquals("raw" to "sample", ReactNativeBlobUtilFS.resourceName("bundle-res://raw/sample"))
        for (bad in listOf("bundle-res://sample", "bundle-res://raw/", "bundle-res:///sample", "bundle-res://raw/a/b")) {
            assertNull(bad, ReactNativeBlobUtilFS.resourceName(bad))
        }
    }

    // read and write a range

    @Test
    fun `readRangeOfFile reads the range, to the end, and nothing past it`() {
        val file = File(tmp.root, "r.bin").apply { writeBytes(bytes(0, 1, 2, 3, 4, 5)) }
        assertArrayEquals(bytes(2, 3), ReactNativeBlobUtilFS.readRangeOfFile(file, 2, 2))
        assertArrayEquals(bytes(4, 5), ReactNativeBlobUtilFS.readRangeOfFile(file, 4, -1))
        assertArrayEquals(bytes(5), ReactNativeBlobUtilFS.readRangeOfFile(file, 5, 100))
        assertArrayEquals(bytes(), ReactNativeBlobUtilFS.readRangeOfFile(file, 6, -1))
        assertArrayEquals(bytes(), ReactNativeBlobUtilFS.readRangeOfFile(file, 2, 0))
    }

    @Test
    fun `readRangeOfStream skips and reads the same ranges from a stream`() {
        val stream = { ByteArrayInputStream(bytes(0, 1, 2, 3, 4, 5)) }
        assertArrayEquals(bytes(2, 3), ReactNativeBlobUtilFS.readRangeOfStream(stream(), 2, 2))
        assertArrayEquals(bytes(4, 5), ReactNativeBlobUtilFS.readRangeOfStream(stream(), 4, -1))
        assertArrayEquals(bytes(), ReactNativeBlobUtilFS.readRangeOfStream(stream(), 9, -1))
        val big = ByteArray(30000) { (it % 251).toByte() }
        assertArrayEquals(big.copyOfRange(10, 25010), ReactNativeBlobUtilFS.readRangeOfStream(ByteArrayInputStream(big), 10, 25000))
    }

    @Test
    fun `writeRangeOfFile overwrites in place, appends, and fills a gap with zeros`() {
        val file = File(tmp.root, "w.bin").apply { writeBytes(bytes(1, 2, 3, 4)) }
        ReactNativeBlobUtilFS.writeRangeOfFile(file, bytes(9, 9), 1)
        assertArrayEquals(bytes(1, 9, 9, 4), file.readBytes())
        ReactNativeBlobUtilFS.writeRangeOfFile(file, bytes(7), -1)
        assertArrayEquals(bytes(1, 9, 9, 4, 7), file.readBytes())
        ReactNativeBlobUtilFS.writeRangeOfFile(file, bytes(8), 7)
        assertArrayEquals(bytes(1, 9, 9, 4, 7, 0, 0, 8), file.readBytes())
        ReactNativeBlobUtilFS.writeRangeOfFile(file, bytes(5, 5, 5), 6)
        assertArrayEquals(bytes(1, 9, 9, 4, 7, 0, 5, 5, 5), file.readBytes())
    }

    @Test
    fun `writeBytesAt creates a missing file and resolves the bytes written`() {
        val file = File(tmp.root, "new.bin")
        val p = RecordingPromise()
        ReactNativeBlobUtilFS.writeBytesAt(file.plain, bytes(1, 2, 3), -1, p.promise)
        assertEquals(3, p.resolved())
        assertArrayEquals(bytes(1, 2, 3), file.readBytes())
    }

    @Test
    fun `writeBytesAt rejects a directory and a missing parent, and leaves nothing behind`() {
        val dir = tmp.newFolder("d")
        val isDir = RecordingPromise()
        ReactNativeBlobUtilFS.writeBytesAt(dir.plain, bytes(1), 0, isDir.promise)
        assertEquals("EISDIR", isDir.code())
        val missing = File(tmp.root, "no/such/file.bin")
        val noParent = RecordingPromise()
        ReactNativeBlobUtilFS.writeBytesAt(missing.plain, bytes(1), 0, noParent.promise)
        assertEquals("ENOENT", noParent.code())
        assertFalse(missing.parentFile!!.exists())
    }

    // touch

    @Test
    fun `touch creates a missing file and sets the modification time`() {
        val file = File(tmp.root, "t.txt")
        val p = RecordingPromise()
        ReactNativeBlobUtilFS.touch(file.plain, 1500000000000, p.promise)
        assertNull(p.resolved())
        assertTrue(file.isFile)
        assertEquals(0L, file.length())
        assertEquals(1500000000000, file.lastModified())
    }

    @Test
    fun `touch keeps the content of an existing file and works on a directory`() {
        val file = File(tmp.root, "t.txt").apply { writeText("kept") }
        val p = RecordingPromise()
        ReactNativeBlobUtilFS.touch(file.plain, 1600000000000, p.promise)
        assertNull(p.resolved())
        assertEquals("kept", file.readText())
        assertEquals(1600000000000, file.lastModified())
        val dir = tmp.newFolder("dir")
        val q = RecordingPromise()
        ReactNativeBlobUtilFS.touch(dir.plain, 1400000000000, q.promise)
        assertNull(q.resolved())
        assertEquals(1400000000000, dir.lastModified())
    }

    @Test
    fun `touch rejects a missing directory, an asset and a resource`() {
        val p = RecordingPromise()
        ReactNativeBlobUtilFS.touch(File(tmp.root, "no/such.txt").plain, 1, p.promise)
        assertEquals("ENOENT", p.code())
        for (path in listOf("bundle-assets://a.txt", "bundle-res://raw/a")) {
            val q = RecordingPromise()
            ReactNativeBlobUtilFS.touch(path, 1, q.promise)
            assertEquals(path, "EINVAL", q.code())
        }
    }

    // cp and mv

    private fun tree(root: File): Map<String, String> =
        root.walkTopDown().filter { it != root }.associate {
            it.relativeTo(root).path.replace('\\', '/') to (if (it.isDirectory) "/" else it.readText())
        }

    @Test
    fun `cp copies a directory with everything in it`() {
        val src = tmp.newFolder("src")
        File(src, "sub/deeper").mkdirs()
        File(src, "a.txt").writeText("a")
        File(src, "sub/b.txt").writeText("bb")
        File(src, "sub/deeper/c.txt").writeText("ccc")
        File(src, "empty").mkdir()
        val dest = File(tmp.root, "copy")
        val p = RecordingPromise()
        ReactNativeBlobUtilFS.cp(src.plain, dest.plain, p.promise)
        assertNull(p.resolved())
        assertEquals(tree(src), tree(dest))
        assertEquals(6, tree(dest).size)
    }

    @Test
    fun `cp of a directory refuses an existing directory and replaces a file`() {
        val src = tmp.newFolder("src").also { File(it, "a.txt").writeText("a") }
        val existing = tmp.newFolder("existing").also { File(it, "keep.txt").writeText("k") }
        val onto = RecordingPromise()
        ReactNativeBlobUtilFS.cp(src.plain, existing.plain, onto.promise)
        assertEquals("EEXIST", onto.code())
        assertEquals(mapOf("keep.txt" to "k"), tree(existing))

        val file = File(tmp.root, "file.txt").apply { writeText("f") }
        val replace = RecordingPromise()
        ReactNativeBlobUtilFS.cp(src.plain, file.plain, replace.promise)
        assertNull(replace.resolved())
        assertTrue(file.isDirectory)
        assertEquals(mapOf("a.txt" to "a"), tree(file))
    }

    @Test
    fun `cp of a directory rejects a missing parent and a copy into itself`() {
        val src = tmp.newFolder("src").also { File(it, "a.txt").writeText("a") }
        val noParent = RecordingPromise()
        ReactNativeBlobUtilFS.cp(src.plain, File(tmp.root, "no/such/copy").plain, noParent.promise)
        assertEquals("ENOENT", noParent.code())
        val inside = RecordingPromise()
        ReactNativeBlobUtilFS.cp(src.plain, File(src, "nested").plain, inside.promise)
        assertEquals("EINVAL", inside.code())
        assertFalse(File(src, "nested").exists())
    }

    @Test
    fun `cp of a file onto a directory rejects EEXIST and leaves the directory`() {
        val file = File(tmp.root, "a.txt").apply { writeText("a") }
        val dir = tmp.newFolder("dir")
        val p = RecordingPromise()
        ReactNativeBlobUtilFS.cp(file.plain, dir.plain, p.promise)
        assertEquals("EEXIST", p.code())
        assertTrue(dir.isDirectory)
    }

    @Test
    fun `mv onto a directory rejects EEXIST, even onto an empty one`() {
        val file = File(tmp.root, "a.txt").apply { writeText("a") }
        val dir = tmp.newFolder("empty")
        val p = RecordingPromise()
        ReactNativeBlobUtilFS.mv(file.plain, dir.plain, p.promise)
        assertEquals("EEXIST", p.code())
        assertTrue(dir.isDirectory)
        assertTrue(file.isFile)
    }

    // open.pick and media.copyToInternal

    @Test
    fun `the picker intent type is the one type asked for, or the shared wildcard`() {
        assertEquals("*/*", ReactNativeBlobUtilImpl.pickerType(emptyList()))
        assertEquals("application/pdf", ReactNativeBlobUtilImpl.pickerType(listOf("application/pdf")))
        assertEquals("image/*", ReactNativeBlobUtilImpl.pickerType(listOf("image/png", "image/jpeg")))
        assertEquals("*/*", ReactNativeBlobUtilImpl.pickerType(listOf("image/png", "application/pdf")))
        assertEquals("*/*", ReactNativeBlobUtilImpl.pickerType(listOf("*/*", "*/*")))
    }

    @Test
    fun `fitWithin keeps the aspect ratio and never enlarges`() {
        assertEquals(640 to 480, ReactNativeBlobUtilMediaCollection.fitWithin(4000, 3000, 640, 640))
        assertEquals(480 to 640, ReactNativeBlobUtilMediaCollection.fitWithin(3000, 4000, 640, 640))
        assertEquals(1000 to 750, ReactNativeBlobUtilMediaCollection.fitWithin(4000, 3000, 1000, 0))
        assertEquals(400 to 300, ReactNativeBlobUtilMediaCollection.fitWithin(4000, 3000, 0, 300))
        assertEquals(100 to 50, ReactNativeBlobUtilMediaCollection.fitWithin(100, 50, 1000, 1000))
        assertEquals(1 to 1, ReactNativeBlobUtilMediaCollection.fitWithin(10000, 1, 1, 0))
    }

    @Test
    fun `sampleSize halves while the image stays at least the target size`() {
        assertEquals(4, ReactNativeBlobUtilMediaCollection.sampleSize(4000, 3000, 640, 480))
        assertEquals(1, ReactNativeBlobUtilMediaCollection.sampleSize(640, 480, 640, 480))
        assertEquals(2, ReactNativeBlobUtilMediaCollection.sampleSize(1300, 1000, 640, 480))
    }

    @Test
    fun `scale options are active only when asked for, and default to quality 90`() {
        assertFalse(ReactNativeBlobUtilMediaCollection.ScaleOptions.of(0, 0, -1.0).active)
        assertTrue(ReactNativeBlobUtilMediaCollection.ScaleOptions.of(640, 0, -1.0).active)
        assertTrue(ReactNativeBlobUtilMediaCollection.ScaleOptions.of(0, 0, 0.0).active)
        assertEquals(90, ReactNativeBlobUtilMediaCollection.ScaleOptions.of(640, 0, -1.0).quality)
        assertEquals(50, ReactNativeBlobUtilMediaCollection.ScaleOptions.of(0, 0, 0.5).quality)
    }
}

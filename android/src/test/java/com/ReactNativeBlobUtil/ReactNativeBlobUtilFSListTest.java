package com.ReactNativeBlobUtil;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.facebook.react.bridge.Callback;

import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * File.list() is null for a directory that cannot be read, not only for a file.
 * lstat iterated the null listing on AsyncTask's thread, and the
 * NullPointerException ended the app (#425). It reports an error now.
 * Needs a host where a directory can be made unreadable: not Windows, not root.
 */
public class ReactNativeBlobUtilFSListTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Test
    public void lstatReportsAnErrorForAFolderThatCannotBeRead() throws IOException {
        File dir = tmp.newFolder("locked");
        try (FileWriter inside = new FileWriter(new File(dir, "inside.txt"))) {
            inside.write("x");
        }
        try {
            Assume.assumeTrue("cannot make a folder unreadable here", dir.setReadable(false) && dir.list() == null);

            List<Object[]> calls = new ArrayList<>();
            Callback callback = args -> calls.add(args);
            ReactNativeBlobUtilFS.lstatIn(dir.getPath(), callback);
            assertEquals(1, calls.size());
            assertTrue(String.valueOf(calls.get(0)[0]), String.valueOf(calls.get(0)[0]).contains("cannot be read"));
        } finally {
            dir.setReadable(true);
        }
    }
}

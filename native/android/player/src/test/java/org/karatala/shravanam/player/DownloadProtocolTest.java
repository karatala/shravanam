package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class DownloadProtocolTest {
    @Rule public final TemporaryFolder files = new TemporaryFolder();

    @Test public void limitsFormatsAndDecodesStructuredTitles() throws Exception {
        assertTrue(DownloadProtocol.format(false, 720).contains("[height<=720]"));
        assertTrue(DownloadProtocol.format(false, 480).contains("+bestaudio"));
        assertThrows(IllegalArgumentException.class, () -> DownloadProtocol.format(false, 2160));
        assertEquals("Title \"quoted\"\nNext line", DownloadProtocol.string("\"Title \\\"quoted\\\"\\nNext line\""));
        assertThrows(Exception.class, () -> DownloadProtocol.string("{\"url\":\"https://example.com\"}"));
    }

    @Test public void validatesCompleteFilesAndRejectsPartialFilesOrEscapedPaths() throws Exception {
        File directory = this.files.newFolder("owned");
        File ready = new File(directory, "media.mkv");
        Files.write(ready.toPath(), new byte[] { 1, 2, 3 });
        assertEquals(ready.getCanonicalFile(), DownloadProtocol.completedFile(directory, ready.getPath()));
        File partial = new File(directory, "media.mkv.part");
        Files.write(partial.toPath(), new byte[] { 1 });
        assertThrows(IOException.class, () -> DownloadProtocol.completedFile(directory, partial.getPath()));
        File outside = this.files.newFile("media.m4a");
        Files.write(outside.toPath(), new byte[] { 1 });
        assertThrows(IOException.class, () -> DownloadProtocol.completedFile(directory, outside.getPath()));
        File empty = new File(directory, "media.mp4");
        assertTrue(empty.createNewFile());
        assertThrows(IOException.class, () -> DownloadProtocol.completedFile(directory, empty.getPath()));
    }

    @Test public void handlesUnknownTotalsAndBoundsInvalidProgressValues() {
        DownloadProtocol.Progress known = new DownloadProtocol.Progress("downloading|512|1024|12|256|140");
        assertEquals(50, known.percent);
        assertEquals(12, known.eta);
        DownloadProtocol.Progress unknown = new DownloadProtocol.Progress("downloading|1024|NA|NA|NA|251");
        assertEquals(0, unknown.total);
        assertEquals(1024, unknown.downloaded);
        assertEquals(99, new DownloadProtocol.Progress("finished|2048|1024|0|0|140").percent);
        assertEquals(0, new DownloadProtocol.Progress("downloading|-1|NaN|Infinity|-3|140").downloaded);
        assertThrows(IllegalArgumentException.class, () -> new DownloadProtocol.Progress("https://example.com/private"));
    }
}

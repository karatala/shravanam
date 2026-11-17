package org.karatala.shravanam.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import java.io.IOException;
import org.junit.Test;

public final class DiagnosticLogTest {
    @Test
    public void removesPrivateAddressesPathsAndCredentialsBeforeReturningOrStoringEvents() {
        DiagnosticLog log = new DiagnosticLog();
        String details = "HTTP 403\nhttps://media.googlevideo.com/videoplayback?sig=private-signature\ncontent://provider/private-document\n"
            + "Cookie: private-cookie\n'Authorization': 'Bearer private-auth'\nhttp_headers={'Referer': 'private-referrer'}\npo_token=private-token\n"
            + "File \"/data/user/0/private/package name/runtime.py\"\nC:\\Users\\private-user\\book.mp4\n'C:\\Users\\private name\\book.mp4'\n\\\\private-server\\share\\book.mp4\n"
            + "https%3A%2F%2Fexample.com%2Fprivate-encoded";
        String entry = log.add("youtube.audio.probe.failed", details, new IOException("HTTP 403 at https://media.googlevideo.com/private-exception"));
        assertFalse(entry.contains("private-"));
        assertFalse(entry.contains("private name"));
        assertFalse(entry.contains("package name"));
        assertTrue(entry.contains("HTTP 403"));
        assertTrue(entry.contains("java.io.IOException"));
        assertFalse(log.report().contains("googlevideo.com"));
    }

    @Test
    public void keepsTheCauseAndLastExtractorErrorWhenVerboseOutputIsLong() {
        DiagnosticLog log = new DiagnosticLog();
        IOException failure = new IOException("extract failed", new IllegalStateException("[debug] ".repeat(3000) + "\nERROR: Sign in to confirm you are not a bot"));
        log.add("youtube.audio.resolve.failed", "extractor", failure);
        String report = log.report();
        assertTrue(report.contains("java.io.IOException"));
        assertTrue(report.contains("java.lang.IllegalStateException"));
        assertTrue(report.contains("ERROR: Sign in to confirm you are not a bot"));
        assertTrue(report.length() < 12500);
    }

    @Test
    public void boundsHistoryAndKeepsRecentFailures() {
        DiagnosticLog log = new DiagnosticLog();
        for (int idx = 0; idx < 100; idx++) log.add("probe", "attempt=" + idx, null);
        assertFalse(log.report().contains("attempt=0\n"));
        assertTrue(log.report().contains("attempt=99\n"));
        for (int idx = 0; idx < 100; idx++) log.add("failed", "detail ".repeat(3000), null);
        assertTrue(log.report().length() <= 48000);
    }

    @Test
    public void stopsAtCircularExceptionCauses() {
        IOException first = new IOException("first");
        IOException second = new IOException("second", first);
        first.initCause(second);
        DiagnosticLog log = new DiagnosticLog();
        log.add("cycle", "failure", first);
        assertTrue(log.report().length() < 5000);
    }
}

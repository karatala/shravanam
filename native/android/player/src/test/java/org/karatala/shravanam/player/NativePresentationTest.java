package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;
import org.junit.Test;

public final class NativePresentationTest {
    @Test
    public void videoWaitsForDecodedAndSynchronizedFrames() {
        VideoSync.Decision waiting = VideoSync.decide(10000, 10000, false, true, 500, 1);
        assertEquals(-1, waiting.seekTo);
        assertFalse(waiting.play);
        assertFalse(waiting.show);
        VideoSync.Decision ahead = VideoSync.decide(10000, 10500, true, true, 500, 1);
        assertEquals(-1, ahead.seekTo);
        assertFalse(ahead.play);
        assertFalse(ahead.show);
        VideoSync.Decision aligned = VideoSync.decide(10000, 10040, true, true, 500, 1);
        assertTrue(aligned.play);
        assertTrue(aligned.show);
    }

    @Test
    public void videoCatchesUpWithoutChangingTheAudioClock() {
        assertEquals(10600, VideoSync.decide(10000, 8000, true, true, 500, 1).seekTo);
        assertEquals(11100, VideoSync.decide(10000, 8000, true, true, 500, 2).seekTo);
        assertEquals(13000, VideoSync.decide(10000, 8000, true, true, 60000, 3).seekTo);
        VideoSync.Decision paused = VideoSync.decide(10000, 8000, true, false, 500, 2);
        assertEquals(10000, paused.seekTo);
        assertFalse(paused.play);
        assertFalse(paused.show);
        assertTrue(VideoSync.decide(10000, 10000, true, false, 500, 2).show);
    }

    @Test
    public void detectsUserSeeksWithoutTreatingNormalPlaybackAsAJump() {
        assertFalse(VideoSync.jumped(1000, 1200, 100, true, 2));
        assertFalse(VideoSync.jumped(1000, 1000, 5000, false, 1));
        assertTrue(VideoSync.jumped(30000, 15000, 50, true, 1));
        assertTrue(VideoSync.jumped(30000, 60000, 50, true, 1));
    }

    @Test
    public void browserAcceptsHttpsAndSearchWhilePreservingVideoTimestamps() {
        assertEquals("https://m.youtube.com", SourceBrowserUrl.address(""));
        assertEquals("https://example.com/path", SourceBrowserUrl.address("example.com/path"));
        assertEquals("https://m.youtube.com/results?search_query=calm+music", SourceBrowserUrl.address("calm music"));
        String video = "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=90";
        assertEquals(video, SourceBrowserUrl.address(video));
        assertTrue(SourceBrowserUrl.navigable(video));
        assertEquals(Long.valueOf(90000), YouTubeSource.parse(video).start);
    }

    @Test
    public void websiteNavigationCannotOpenLocalFilesOrNativeSchemes() {
        for (String value : new String[] { "http://example.com", "file:///data/private", "content://provider/file", "javascript:alert(1)", "data:text/html,hello", "intent://open", "https://user:pass@example.com", "https://example.com:444/page", "/relative/path" }) {
            assertFalse(value, SourceBrowserUrl.navigable(value));
        }
        assertThrows(IllegalArgumentException.class, () -> SourceBrowserUrl.address("javascript:alert(1)"));
        assertThrows(IllegalArgumentException.class, () -> SourceBrowserUrl.address("http://example.com"));
    }
}

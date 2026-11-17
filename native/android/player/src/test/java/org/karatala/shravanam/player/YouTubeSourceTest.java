package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class YouTubeSourceTest {
    @Test
    public void canonicalizesOneVideoAndRetainsExplicitTime() {
        YouTubeSource source = YouTubeSource.parse("https://youtu.be/dQw4w9WgXcQ?t=1m2s");
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", source.url);
        assertEquals(Long.valueOf(62000), source.start);
        assertEquals(source.id, YouTubeSource.parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=ignored&index=3").id);
        assertEquals(Long.valueOf(0), YouTubeSource.parse(source.url + "&start=0").start);
        assertEquals(Long.valueOf(3000), YouTubeSource.parse(source.url + "#t=3").start);
        assertNull(YouTubeSource.parse(source.url).start);
        assertNotEquals(source.id, YouTubeSource.parse("https://youtube.com/shorts/jNQXAC9IVRw").id);
    }

    @Test
    public void rejectsOtherSitesPlaylistOnlyAndBadTimestamps() {
        for (String input : new String[] { "", "http://youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ", "https://user@youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com:443/watch?v=dQw4w9WgXcQ", "https://youtube.com/playlist?list=some", "https://youtu.be/invalid", "https://youtu.be/dQw4w9WgXcQ?t=-1", "https://youtu.be/dQw4w9WgXcQ?t=99999999999999999999", "https://youtu.be/dQw4w9WgXcQ?t=" }) {
            assertThrows(input, IllegalArgumentException.class, () -> YouTubeSource.parse(input));
        }
    }

    private JSONObject metadata() throws Exception {
        return new JSONObject().put("id", "dQw4w9WgXcQ").put("title", "Example").put("url", "https://rr1.googlevideo.com/videoplayback?expire=123&sig=secret").put("protocol", "https").put("acodec", "opus");
    }

    @Test
    public void selectsAudioAndRetainsItsHeadersInMemory() throws Exception {
        JSONObject audio = this.metadata().put("http_headers", new JSONObject().put("User-Agent", "Example agent"));
        JSONObject video = this.metadata().put("acodec", "none");
        JSONObject info = this.metadata().put("requested_formats", new JSONArray().put(video).put(audio));
        YouTubeResolver.Stream stream = YouTubeResolver.parse(info.toString(), YouTubeSource.parse("https://youtu.be/dQw4w9WgXcQ"));
        assertEquals(audio.getString("url"), stream.url);
        assertEquals("Example", stream.title);
        assertEquals("Example agent", stream.headers.get("User-Agent"));
        assertThrows(UnsupportedOperationException.class, () -> stream.headers.put("Other", "value"));
    }

    @Test
    public void selectsVideoIndependentlyAndBoundsItsResolution() throws Exception {
        YouTubeSource source = YouTubeSource.parse("https://youtu.be/dQw4w9WgXcQ");
        JSONObject audio = this.metadata().put("vcodec", "none");
        JSONObject video = this.metadata().put("url", "https://rr1.googlevideo.com/video").put("vcodec", "avc1").put("acodec", "none").put("height", 1080);
        JSONObject info = this.metadata().put("requested_formats", new JSONArray().put(audio).put(video));
        assertEquals(video.getString("url"), YouTubeResolver.parse(info.toString(), source, true).url);
        assertEquals(audio.getString("url"), YouTubeResolver.parse(info.toString(), source).url);
        assertThrows(IllegalArgumentException.class, () -> YouTubeResolver.parse(video.put("height", 2160).toString(), source, true));
    }

    @Test
    public void rejectsUnexpectedSourcesLiveAndUnsafeStreamMetadata() throws Exception {
        YouTubeSource source = YouTubeSource.parse("https://youtu.be/dQw4w9WgXcQ");
        assertThrows(IllegalArgumentException.class, () -> YouTubeResolver.parse(this.metadata().put("id", "jNQXAC9IVRw").toString(), source));
        assertThrows(YouTubeResolver.UnsupportedLive.class, () -> YouTubeResolver.parse(this.metadata().put("is_live", true).toString(), source));
        assertThrows(YouTubeResolver.UnsupportedLive.class, () -> YouTubeResolver.parse(this.metadata().put("live_status", "is_upcoming").toString(), source));
        for (String url : new String[] { "http://rr1.googlevideo.com/audio", "https://example.com/audio", "https://user@rr1.googlevideo.com/audio", "https://rr1.googlevideo.com:443/audio" }) {
            assertThrows(IllegalArgumentException.class, () -> YouTubeResolver.parse(this.metadata().put("url", url).toString(), source));
        }
        assertThrows(IllegalArgumentException.class, () -> YouTubeResolver.parse(this.metadata().put("http_headers", new JSONObject().put("X-Test", "value\r\ninjected: value")).toString(), source));
    }
}

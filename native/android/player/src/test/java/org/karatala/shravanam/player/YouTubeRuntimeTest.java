package org.karatala.shravanam.player;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import static org.junit.Assert.assertEquals;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE, sdk = 28)
public final class YouTubeRuntimeTest {
    @Rule public final TemporaryFolder files = new TemporaryFolder();

    @Test public void prefersVisionOsAndKeepsEmbeddedFallbackRequestsSeparate() {
        YoutubeDLRequest preferred = new YoutubeDLRequest("https://youtu.be/dQw4w9WgXcQ");
        YouTubeRuntime.configure(preferred, YouTubeRuntime.PRIMARY_CLIENT);
        assertEquals("youtube:player_client=visionos", preferred.getOption("--extractor-args"));
        YoutubeDLRequest fallback = new YoutubeDLRequest("https://youtu.be/dQw4w9WgXcQ");
        YouTubeRuntime.configure(fallback, YouTubeRuntime.FALLBACK_CLIENT);
        assertEquals("youtube:player_client=web_embedded", fallback.getOption("--extractor-args"));
    }

    private String hash(byte[] bytes) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format("%02x", value & 255));
        return result.toString();
    }

    @Test public void replacesAnOldCachedExtractorAndKeepsAnAlreadyVerifiedCopy() throws Exception {
        File target = this.files.newFile("yt-dlp");
        byte[] old = "old bundled extractor".getBytes(StandardCharsets.UTF_8);
        byte[] fresh = "new APK extractor with EJS".getBytes(StandardCharsets.UTF_8);
        Files.write(target.toPath(), old);
        assertTrue(YouTubeRuntime.install(target, new ByteArrayInputStream(fresh), this.hash(fresh)));
        assertArrayEquals(fresh, Files.readAllBytes(target.toPath()));
        assertFalse(YouTubeRuntime.install(target, new ByteArrayInputStream(new byte[0]), this.hash(fresh)));
        assertArrayEquals(fresh, Files.readAllBytes(target.toPath()));
    }

    @Test public void rejectsAnIncorrectPackageWithoutReplacingTheCachedExtractor() throws Exception {
        File target = this.files.newFile("yt-dlp");
        byte[] old = "previous extractor".getBytes(StandardCharsets.UTF_8);
        Files.write(target.toPath(), old);
        assertThrows(IOException.class, () -> YouTubeRuntime.install(target, new ByteArrayInputStream(new byte[] { 1, 2 }), this.hash(new byte[] { 3 })));
        assertArrayEquals(old, Files.readAllBytes(target.toPath()));
    }
}

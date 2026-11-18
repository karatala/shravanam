package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.JSONObject;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE, sdk = 28)
public final class OfflineDownloadsTest {
    private static final String URL = "https://youtu.be/dQw4w9WgXcQ";
    @Rule public final TemporaryFolder files = new TemporaryFolder();

    private File complete(OfflineDownloads store, OfflineDownloads.Job job) throws Exception {
        File media = new File(store.directory(job.id), job.audioOnly ? "media.m4a" : "media.mkv");
        Files.write(media.toPath(), new byte[] { 1, 2, 3 });
        store.finish(job.id, "ready", "", media);
        return media;
    }

    @Test public void sharesSourceIdentityAcrossAudioAndVideoAndRestoresReadyCopies() throws Exception {
        File root = this.files.newFolder();
        OfflineDownloads store = new OfflineDownloads(root);
        OfflineDownloads.Job audio = store.start(URL, true, 720, null);
        store.title(audio.id, "Saved title");
        this.complete(store, audio);
        OfflineDownloads.Job video = store.start(URL, false, 1080, null);
        this.complete(store, video);
        OfflineDownloads restarted = new OfflineDownloads(root);
        String sourceId = YouTubeSource.parse(URL).id;
        assertEquals(sourceId, restarted.exact(audio.id).sourceId);
        assertEquals(sourceId, restarted.exact(video.id).sourceId);
        assertEquals(audio.id, restarted.ready(sourceId, false, null).id);
        assertEquals(video.id, restarted.ready(sourceId, true, null).id);
        assertEquals(video.id, restarted.ready(sourceId, false, video.id).id);
        assertEquals("Saved title", restarted.exact(audio.id).title);
        assertNull(restarted.ready("different source", false, video.id));
        assertNull(restarted.ready(sourceId, true, audio.id));
        assertEquals("ready", restarted.start(URL, true, 720, null).status);
        assertFalse(restarted.running(audio.id));
        assertFalse(restarted.snapshot().toString().contains(root.getPath()));
        String index = new String(Files.readAllBytes(new File(root, "index.json").toPath()), StandardCharsets.UTF_8);
        assertFalse(index.contains(root.getPath()));
        JSONObject visible = restarted.snapshot().getJSONArray("items").getJSONObject(0);
        assertFalse(visible.has("filename"));
        assertFalse(visible.has("uri"));
        assertEquals(YouTubeSource.parse(URL).url, visible.getString("url"));
        assertEquals("media.m4a", new JSONObject(index).getJSONArray("items").getJSONObject(0).getString("filename"));
    }

    @Test public void cancellationWinsAgainstLateCompletionAndRetryKeepsPartialBytes() throws Exception {
        OfflineDownloads store = new OfflineDownloads(this.files.newFolder());
        OfflineDownloads.Job job = store.start(URL, false, 720, null);
        File partial = new File(store.directory(job.id), "media.f137.mp4.part");
        Files.write(partial.toPath(), "partial".getBytes(StandardCharsets.UTF_8));
        store.requestCancel(job.id);
        this.complete(store, job);
        assertEquals("cancelled", store.job(job.id).status);
        assertNull(store.exact(job.id));
        assertFalse(store.running(job.id));
        OfflineDownloads.Job retry = store.start("", true, 720, job.id);
        assertEquals(job.id, retry.id);
        assertEquals("partial", new String(Files.readAllBytes(partial.toPath()), StandardCharsets.UTF_8));
        this.complete(store, retry);
        assertNotNull(store.exact(job.id));
    }

    @Test public void interruptedTransfersNeedExplicitRetryAndNeverBecomeOfflineReady() throws Exception {
        File root = this.files.newFolder();
        OfflineDownloads store = new OfflineDownloads(root);
        OfflineDownloads.Job job = store.start(URL, true, 720, null);
        File partial = new File(store.directory(job.id), "media.m4a.part");
        Files.write(partial.toPath(), new byte[] { 1 });
        assertThrows(IllegalStateException.class, () -> store.start(URL, false, 480, null));
        OfflineDownloads restarted = new OfflineDownloads(root);
        assertEquals("interrupted", restarted.job(job.id).status);
        assertFalse(restarted.running(job.id));
        assertNull(restarted.exact(job.id));
        assertTrue(partial.isFile());
    }

    @Test public void rejectsChangedFilesBadPathsAndDamagedIndexWithoutDiscardingMedia() throws Exception {
        File root = this.files.newFolder();
        OfflineDownloads store = new OfflineDownloads(root);
        OfflineDownloads.Job job = store.start(URL, true, 720, null);
        File media = this.complete(store, job);
        Files.write(media.toPath(), new byte[] { 1 });
        assertNull(store.exact(job.id));
        assertEquals("failed", store.snapshot().getJSONArray("items").getJSONObject(0).getString("status"));
        assertThrows(IOException.class, () -> store.directory("../outside"));
        Files.write(new File(root, "index.json").toPath(), "broken".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> new OfflineDownloads(root));
        assertTrue(media.isFile());
    }

    @Test public void retryKeepsDamagedCompletedBytesAsideAndUsesANewOutput() throws Exception {
        OfflineDownloads store = new OfflineDownloads(this.files.newFolder());
        OfflineDownloads.Job job = store.start(URL, true, 720, null);
        File original = this.complete(store, job);
        Files.write(original.toPath(), new byte[] { 9 });
        store.snapshot();
        OfflineDownloads.Job retry = store.start("", true, 720, job.id);
        File retained = new File(store.directory(job.id), ".rejected/media.m4a.1");
        assertTrue(retained.isFile());
        assertEquals(9, Files.readAllBytes(retained.toPath())[0]);
        assertFalse(original.exists());
        this.complete(store, retry);
        assertNotNull(store.exact(job.id));
        assertTrue(retained.isFile());
    }
}

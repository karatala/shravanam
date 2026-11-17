package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.CancellationSignal;
import android.os.Looper;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.robolectric.Shadows;
import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.SimpleBasePlayer;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaSession;
import androidx.media3.test.utils.FakePlayer;
import com.google.common.collect.ImmutableList;
import java.lang.reflect.Constructor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.FutureTask;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.util.ReflectionHelpers;

@OptIn(markerClass = UnstableApi.class)
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@LooperMode(LooperMode.Mode.PAUSED)
public final class SystemControlsTest {
    private PlaybackService service;
    private FakePlayer audio;
    private Player controls;

    @Before public void setup() throws Exception {
        this.service = new PlaybackService();
        ReflectionHelpers.callInstanceMethod(this.service, "attachBaseContext", ReflectionHelpers.ClassParameter.from(Context.class, RuntimeEnvironment.getApplication()));
        String id = "a".repeat(64);
        MediaItem item = new MediaItem.Builder().setMediaId(id).setUri("content://test/book").build();
        SimpleBasePlayer.MediaItemData data = new SimpleBasePlayer.MediaItemData.Builder(id).setMediaItem(item).setDurationUs(120000000).setIsSeekable(true).build();
        this.audio = new FakePlayer(Player.STATE_READY, false, ImmutableList.of(data), 1, 0);
        // Keep real Media3 command/state behavior without an audio device, decoder, or network.
        ReflectionHelpers.setField(this.service, "player", this.audio);
        ReflectionHelpers.setField(this.service, "settings", RuntimeEnvironment.getApplication().getSharedPreferences("test.playback", Context.MODE_PRIVATE));
        ReflectionHelpers.setField(this.service, "backward", 17);
        ReflectionHelpers.setField(this.service, "forward", 42);
        ReflectionHelpers.setField(this.service, "current", MediaFile.fromStored(new JSONObject().put("id", id).put("uri", "content://test/book").put("name", "Book").put("kind", "audio").put("temporary", false)));
        Constructor<?> constructor = Class.forName(PlaybackService.class.getName() + "$SessionPlayer").getDeclaredConstructor(PlaybackService.class);
        constructor.setAccessible(true);
        this.controls = (Player) constructor.newInstance(this.service);
        ReflectionHelpers.setField(this.service, "controls", this.controls);
    }

    @After public void cleanup() {
        if (this.controls != null) this.controls.release();
        if (this.service != null) {
            ((ExecutorService) ReflectionHelpers.getField(this.service, "fileWorker")).shutdownNow();
            ((ExecutorService) ReflectionHelpers.getField(this.service, "youtubeWorker")).shutdownNow();
        }
    }

    @Test public void offlineYouTubeUsesTheSamePositionAndColdPlayPathWithoutResolvingStreams() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        OfflineDownloads downloads = OfflineDownloads.get(context);
        String url = "https://youtu.be/dQw4w9WgXcQ";
        OfflineDownloads.Job job = downloads.start(url, true, 720, null);
        File file = new File(downloads.directory(job.id), "media.m4a");
        Files.write(file.toPath(), new byte[] { 1, 2, 3 });
        downloads.finish(job.id, "ready", "", file);
        String sourceId = YouTubeSource.parse(url).id;
        context.getSharedPreferences("test.playback", Context.MODE_PRIVATE).edit().putLong("position." + sourceId, 38000).commit();
        this.service.openDownload(downloads.exact(job.id), false);
        ((Future<?>) ReflectionHelpers.getField(this.service, "youtubeTask")).get(5, TimeUnit.SECONDS);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        assertEquals(sourceId, this.service.currentMedia().id);
        assertEquals("file", this.audio.getCurrentMediaItem().localConfiguration.uri.getScheme());
        assertEquals(38000, this.audio.getCurrentPosition());
        assertTrue(this.service.snapshot().getBool("offline"));
        assertFalse(this.service.snapshot().toString().contains(file.getPath()));
        this.audio.setPosition(57000);
        this.controls.stop();
        assertEquals(57000, context.getSharedPreferences("test.playback", Context.MODE_PRIVATE).getLong("position." + sourceId, 0));
        this.controls.play();
        ((Future<?>) ReflectionHelpers.getField(this.service, "youtubeTask")).get(5, TimeUnit.SECONDS);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        assertEquals(sourceId, this.audio.getCurrentMediaItem().mediaId);
        assertEquals("file", this.audio.getCurrentMediaItem().localConfiguration.uri.getScheme());
        assertEquals(57000, this.audio.getCurrentPosition());
    }

    @Test public void headsetPreviousAndNextSeekWithinTheSameItem() {
        this.audio.setPosition(30000);
        assertTrue(this.controls.isCommandAvailable(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM));
        assertTrue(this.controls.isCommandAvailable(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM));
        this.controls.seekToPrevious();
        assertEquals(13000, this.audio.getCurrentPosition());
        this.controls.seekToNextMediaItem();
        assertEquals(55000, this.audio.getCurrentPosition());
        this.controls.seekBack();
        assertEquals(38000, this.audio.getCurrentPosition());
        this.controls.seekForward();
        assertEquals(80000, this.audio.getCurrentPosition());
        this.controls.seekToPreviousMediaItem();
        assertEquals(63000, this.audio.getCurrentPosition());
        this.controls.seekToNext();
        assertEquals(105000, this.audio.getCurrentPosition());
        assertEquals(1, this.audio.getMediaItemCount());
        assertEquals("a".repeat(64), this.audio.getCurrentMediaItem().mediaId);
        assertEquals(17000, this.controls.getSeekBackIncrement());
        assertEquals(42000, this.controls.getSeekForwardIncrement());
    }

    @Test public void stopCancelsPendingPlaybackWithoutLosingTheCurrentPosition() throws Exception {
        this.audio.setPosition(30000);
        this.audio.play();
        FutureTask<Void> extraction = new FutureTask<>(() -> null);
        ReflectionHelpers.setField(this.service, "youtubeTask", extraction);
        ReflectionHelpers.setField(this.service, "resolvingYouTube", true);
        ReflectionHelpers.setField(this.service, "selectionAutoplay", true);
        this.controls.stop();
        assertTrue(extraction.isCancelled());
        assertFalse(this.audio.getPlayWhenReady());
        assertTrue(this.service.snapshot().getBoolean("paused"));
        assertEquals(Player.STATE_IDLE, this.audio.getPlaybackState());
        assertEquals(30000, this.audio.getCurrentPosition());
        assertEquals(1, this.audio.getMediaItemCount());
        this.controls.play();
        assertTrue(this.audio.getPlayWhenReady());
        assertEquals(30000, this.audio.getCurrentPosition());
    }

    @Test public void oneHeadsetPlayPauseActionRestartsAnEndedItem() {
        this.audio.setPosition(120000);
        this.audio.play();
        this.audio.setPlaybackState(Player.STATE_ENDED);
        assertFalse(this.controls.getPlayWhenReady());
        // Media3 dispatches a headset toggle using the session player's playWhenReady value.
        if (this.controls.getPlayWhenReady()) this.controls.pause(); else this.controls.play();
        assertEquals(0, this.audio.getCurrentPosition());
        assertTrue(this.audio.getPlayWhenReady());
        assertFalse(this.service.paused());
    }

    @Test public void pauseAndHeadphoneRemovalCancelAutoplayBeforeTheFirstFileLoads() {
        this.audio.setMediaItems(ImmutableList.of());
        this.audio.stop();
        ReflectionHelpers.setField(this.service, "current", null);
        ReflectionHelpers.setField(this.service, "openingFile", true);
        ReflectionHelpers.setField(this.service, "selectionAutoplay", true);
        ReflectionHelpers.callInstanceMethod(this.controls, "refresh");
        assertTrue(this.controls.getPlayWhenReady());
        this.controls.pause();
        assertFalse((boolean) ReflectionHelpers.getField(this.service, "selectionAutoplay"));
        this.controls.play();
        assertTrue((boolean) ReflectionHelpers.getField(this.service, "selectionAutoplay"));
        BroadcastReceiver receiver = ReflectionHelpers.getField(this.service, "noisy");
        receiver.onReceive(RuntimeEnvironment.getApplication(), new Intent(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        assertFalse((boolean) ReflectionHelpers.getField(this.service, "selectionAutoplay"));
        assertTrue(this.service.paused());
        this.controls.stop();
        assertFalse((boolean) ReflectionHelpers.getField(this.service, "openingFile"));
        assertFalse(this.controls.getPlayWhenReady());
    }

    @Test public void metadataOnlyRequestsDoNotLoadOrReplaceTheActiveSource() {
        MediaFile saved = MediaFile.youtube(YouTubeSource.parse("https://youtu.be/dQw4w9WgXcQ"), "Saved video");
        android.content.SharedPreferences settings = ReflectionHelpers.getField(this.service, "settings");
        settings.edit().putString("last-media", saved.id).putString("recent-youtube", new org.json.JSONArray().put(saved.stored()).toString()).putLong("position." + saved.id, 72000).commit();
        PlaybackService preview = this.service;
        MediaSession.MediaItemsWithStartPosition result = preview.resumptionItems(false);
        assertEquals(72000, result.startPositionMs);
        assertEquals(saved.id, result.mediaItems.get(0).mediaId);
        assertTrue(result.mediaItems.get(0).localConfiguration == null);
        assertFalse((boolean) ReflectionHelpers.getField(preview, "openingFile"));
        assertFalse((boolean) ReflectionHelpers.getField(preview, "resolvingYouTube"));
        assertFalse((boolean) ReflectionHelpers.getField(preview, "resumeForeground"));
        assertTrue(ReflectionHelpers.getField(preview, "resuming") == null);
        assertEquals("a".repeat(64), this.audio.getCurrentMediaItem().mediaId);
        MediaSession.ControllerInfo controller = MediaSession.ControllerInfo.createTestOnlyControllerInfo("system.test", 1, android.os.Process.myUid() + 1, 0, 0, false, android.os.Bundle.EMPTY, true);
        preview.onGetSession(controller);
        assertFalse((boolean) ReflectionHelpers.getField(preview, "startupRestored"));
    }

    @Test public void resumptionPublishesSavedPositionWhileKeepingTheSignedStreamOutOfThePlaceholder() throws Exception {
        this.audio.setMediaItems(ImmutableList.of());
        this.audio.stop();
        ReflectionHelpers.setField(this.service, "current", null);
        MediaFile saved = MediaFile.youtube(YouTubeSource.parse("https://youtu.be/dQw4w9WgXcQ"), "Saved video");
        ReflectionHelpers.setField(this.service, "resuming", saved);
        ReflectionHelpers.setField(this.service, "resumeItem", new MediaItem.Builder().setMediaId(saved.id).setMediaMetadata(new MediaMetadata.Builder().setTitle(saved.name).build()).build());
        ReflectionHelpers.setField(this.service, "resumePosition", 45000L);
        ReflectionHelpers.setField(this.service, "resolvingYouTube", true);
        ReflectionHelpers.setField(this.service, "selectionAutoplay", true);
        ReflectionHelpers.callInstanceMethod(this.controls, "refresh");
        assertEquals(Player.STATE_BUFFERING, this.controls.getPlaybackState());
        assertEquals(45000, this.controls.getCurrentPosition());
        assertEquals(saved.id, this.controls.getCurrentMediaItem().mediaId);
        assertTrue(this.controls.getCurrentMediaItem().localConfiguration == null);
        assertFalse(this.controls.isCommandAvailable(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM));
        assertEquals(0, this.audio.getMediaItemCount());
        this.controls.prepare();
        assertEquals(Player.STATE_IDLE, this.audio.getPlaybackState());
        this.controls.pause();
        assertTrue(this.service.snapshot().getBoolean("paused"));
        assertEquals(45, this.service.snapshot().getDouble("time"), 0);
        this.controls.play();
        assertTrue((boolean) ReflectionHelpers.getField(this.service, "selectionAutoplay"));
        CancellationSignal read = new CancellationSignal();
        ReflectionHelpers.setField(this.service, "pendingRead", read);
        this.controls.stop();
        assertTrue(read.isCanceled());
        assertTrue(ReflectionHelpers.getField(this.service, "resuming") == null);
        assertEquals(0, this.audio.getMediaItemCount());
        assertFalse(this.controls.getPlayWhenReady());
    }
}

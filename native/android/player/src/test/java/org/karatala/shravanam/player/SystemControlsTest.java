package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.common.SimpleBasePlayer;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
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
import org.mockito.AdditionalAnswers;
import org.mockito.Mockito;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.util.ReflectionHelpers;

@OptIn(markerClass = UnstableApi.class)
@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE, sdk = 28)
@LooperMode(LooperMode.Mode.PAUSED)
public final class SystemControlsTest {
    private PlaybackService service;
    private FakePlayer audio;
    private Player controls;

    @Before public void setup() throws Exception {
        this.service = new PlaybackService();
        String id = "a".repeat(64);
        MediaItem item = new MediaItem.Builder().setMediaId(id).setUri("content://test/book").build();
        SimpleBasePlayer.MediaItemData data = new SimpleBasePlayer.MediaItemData.Builder(id).setMediaItem(item).setDurationUs(120000000).setIsSeekable(true).build();
        this.audio = new FakePlayer(Player.STATE_READY, false, ImmutableList.of(data), 1, 0);
        // Keep real Media3 command/state behavior without an audio device, decoder, or network.
        ReflectionHelpers.setField(this.service, "player", Mockito.mock(ExoPlayer.class, AdditionalAnswers.delegatesTo(this.audio)));
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
        this.audio.clearMediaItems();
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
}

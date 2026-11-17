package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.KeyEvent;
import androidx.core.content.IntentCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE, sdk = 28)
public final class PlaybackResumeTest {
    private SharedPreferences settings;
    private MediaFile youtube;
    private MediaFile local;

    @Before public void setup() throws Exception {
        this.settings = RuntimeEnvironment.getApplication().getSharedPreferences("shravanam.playback", Context.MODE_PRIVATE);
        this.settings.edit().clear().commit();
        this.youtube = MediaFile.youtube(YouTubeSource.parse("https://youtu.be/dQw4w9WgXcQ?t=90"), "Video");
        this.local = MediaFile.fromStored(new JSONObject().put("id", "b".repeat(64)).put("uri", "content://test/book").put("name", "Book").put("kind", "audio").put("temporary", false));
    }

    @Test public void selectsTheExactLastItemAcrossBothListsWithoutFallingBackToAnotherBook() throws Exception {
        JSONArray links = new JSONArray().put(new JSONObject().put("bad", true)).put(this.youtube.stored());
        this.settings.edit().putString("recent", new JSONArray().put(this.local.stored()).toString()).putString("recent-youtube", links.toString()).putString("last-media", this.youtube.id).commit();
        assertEquals(this.youtube.id, SavedPlayback.last(this.settings).id);
        assertEquals(this.youtube.uri, SavedPlayback.last(this.settings).uri);
        assertNull(YouTubeSource.parse(SavedPlayback.last(this.settings).uri.toString()).start);
        this.settings.edit().putString("last-media", this.local.id).commit();
        assertEquals(this.local.id, SavedPlayback.last(this.settings).id);
        this.settings.edit().putString("last-media", "missing").commit();
        assertNull(SavedPlayback.last(this.settings));
    }

    @Test public void restoresSavedProgressAndTreatsCompletedOrInvalidProgressAsZero() {
        this.settings.edit().putLong("position." + this.youtube.id, 96700).commit();
        assertEquals(96700, SavedPlayback.position(this.settings, this.youtube));
        this.settings.edit().putLong("position." + this.youtube.id, 0).commit();
        assertEquals(0, SavedPlayback.position(this.settings, this.youtube));
        this.settings.edit().putLong("position." + this.youtube.id, -100).commit();
        assertEquals(0, SavedPlayback.position(this.settings, this.youtube));
        this.settings.edit().putString("position." + this.youtube.id, "broken").commit();
        assertEquals(0, SavedPlayback.position(this.settings, this.youtube));
    }

    @Test public void aStoredTemporaryFlagCannotReplaceAnActualPersistentReadGrant() {
        assertFalse(SavedPlayback.readable(RuntimeEnvironment.getApplication(), this.local));
        assertTrue(SavedPlayback.readable(RuntimeEnvironment.getApplication(), this.youtube));
        assertFalse(SavedPlayback.readable(RuntimeEnvironment.getApplication(), null));
    }

    @Test public void onlyTheFirstPlayKeyDownCanWakeTheService() {
        for (int key : new int[] { KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK }) assertTrue(SavedPlayback.playRequest(this.key(KeyEvent.ACTION_DOWN, key, 0)));
        for (int key : new int[] { KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP, KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN }) assertFalse(SavedPlayback.playRequest(this.key(KeyEvent.ACTION_DOWN, key, 0)));
        assertFalse(SavedPlayback.playRequest(this.key(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY, 0)));
        assertFalse(SavedPlayback.playRequest(this.key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY, 1)));
        assertFalse(SavedPlayback.playRequest(new Intent(Intent.ACTION_MEDIA_BUTTON)));
        assertFalse(SavedPlayback.playRequest(null));
    }

    @Test public void aColdHeadsetToggleBecomesAnIdempotentPlayRequest() {
        this.settings.edit().putString("recent-youtube", new JSONArray().put(this.youtube.stored()).toString()).putString("last-media", this.youtube.id).commit();
        Intent intent = this.key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_HEADSETHOOK, 0);
        assertTrue(new ResumeMediaButtonReceiver().shouldStartForegroundService(RuntimeEnvironment.getApplication(), intent));
        assertTrue(intent.getBooleanExtra(ResumeMediaButtonReceiver.RESUME_REQUEST, false));
        assertEquals(KeyEvent.KEYCODE_MEDIA_PLAY, IntentCompat.getParcelableExtra(intent, Intent.EXTRA_KEY_EVENT, KeyEvent.class).getKeyCode());
    }

    private Intent key(int action, int key, int repeat) {
        return new Intent(Intent.ACTION_MEDIA_BUTTON).putExtra(Intent.EXTRA_KEY_EVENT, new KeyEvent(0, 0, action, key, repeat));
    }
}

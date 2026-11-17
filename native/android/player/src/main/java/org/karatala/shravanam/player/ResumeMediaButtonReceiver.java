package org.karatala.shravanam.player;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;
import android.view.KeyEvent;
import androidx.annotation.OptIn;
import androidx.annotation.RequiresApi;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaButtonReceiver;

@OptIn(markerClass = UnstableApi.class)
public final class ResumeMediaButtonReceiver extends MediaButtonReceiver {
    static final String RESUME_REQUEST = "org.karatala.shravanam.RESUME_REQUEST";
    static final String RESUME_VERSION = "org.karatala.shravanam.RESUME_VERSION";

    @Override protected boolean shouldStartForegroundService(Context context, Intent intent) {
        if (!SavedPlayback.playRequest(intent)) return false;
        MediaFile saved = SavedPlayback.last(context.getSharedPreferences("shravanam.playback", Context.MODE_PRIVATE));
        boolean active = PlaybackService.instance != null && (PlaybackService.instance.currentMedia() != null || PlaybackService.instance.openingMedia());
        if (!active && !SavedPlayback.readable(context, saved)) {
            Toast.makeText(context, R.string.shravanam_resume_unavailable, Toast.LENGTH_LONG).show();
            return false;
        }
        boolean resume = PlaybackService.instance == null || PlaybackService.instance.paused();
        intent.putExtra(RESUME_REQUEST, resume);
        if (resume) intent.putExtra(Intent.EXTRA_KEY_EVENT, new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY));
        return true;
    }

    @RequiresApi(31)
    @Override protected void onForegroundServiceStartNotAllowedException(Context context, Intent intent, ForegroundServiceStartNotAllowedException failure) {
        Toast.makeText(context, R.string.shravanam_resume_background, Toast.LENGTH_LONG).show();
    }
}

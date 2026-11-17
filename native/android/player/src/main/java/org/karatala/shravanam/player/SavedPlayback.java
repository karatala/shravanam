package org.karatala.shravanam.player;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.view.KeyEvent;
import androidx.core.content.IntentCompat;
import org.json.JSONArray;

final class SavedPlayback {
    static MediaFile last(SharedPreferences settings) {
        String id;
        try { id = settings.getString("last-media", ""); }
        catch (ClassCastException failure) { return null; }
        if (id.isEmpty()) return null;
        for (String key : new String[] { "recent", "recent-youtube" }) {
            try {
                JSONArray entries = new JSONArray(settings.getString(key, "[]"));
                for (int idx = 0; idx < Math.min(20, entries.length()); idx++) {
                    try {
                        MediaFile file = MediaFile.fromStored(entries.getJSONObject(idx));
                        if (file.id.equals(id)) return file;
                    } catch (Exception failure) { /* Keep looking past an invalid descriptor. */ }
                }
            } catch (Exception failure) { /* The other source list can still contain the last item. */ }
        }
        return null;
    }

    static long position(SharedPreferences settings, MediaFile file) {
        try { return Math.max(0, settings.getLong("position." + file.id, 0)); }
        catch (ClassCastException failure) { return 0; }
    }

    static boolean readable(Context context, MediaFile file) {
        if (file == null) return false;
        if (file.youtube()) return true;
        try { for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) if (permission.isReadPermission() && permission.getUri().equals(file.uri)) return true; }
        catch (SecurityException failure) { return false; }
        return false;
    }

    static boolean playRequest(Intent intent) {
        if (intent == null || !Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) return false;
        KeyEvent event = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_KEY_EVENT, KeyEvent.class);
        if (event == null || event.getAction() != KeyEvent.ACTION_DOWN || event.getRepeatCount() != 0) return false;
        return event.getKeyCode() == KeyEvent.KEYCODE_MEDIA_PLAY || event.getKeyCode() == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || event.getKeyCode() == KeyEvent.KEYCODE_HEADSETHOOK;
    }
}

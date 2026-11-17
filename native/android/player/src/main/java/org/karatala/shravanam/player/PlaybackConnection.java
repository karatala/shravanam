package org.karatala.shravanam.player;

import android.app.Activity;
import android.content.ComponentName;
import androidx.annotation.OptIn;
import androidx.core.content.ContextCompat;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.function.Consumer;

@OptIn(markerClass = UnstableApi.class)
final class PlaybackConnection {
    private final ListenableFuture<MediaController> controller;
    private boolean closed;

    PlaybackConnection(Activity activity, Consumer<PlaybackService> ready, Runnable failed) {
        this.controller = new MediaController.Builder(activity, new SessionToken(activity, new ComponentName(activity, PlaybackService.class))).buildAsync();
        this.controller.addListener(() -> {
            if (this.closed || activity.isFinishing() || activity.isDestroyed()) return;
            try {
                if (!this.controller.get().isConnected() || PlaybackService.instance == null) throw new IllegalStateException("Player disconnected");
                ready.accept(PlaybackService.instance);
            } catch (Exception failure) { failed.run(); }
        }, ContextCompat.getMainExecutor(activity));
    }

    void close() { if (this.closed) return; this.closed = true; MediaController.releaseFuture(this.controller); }
}

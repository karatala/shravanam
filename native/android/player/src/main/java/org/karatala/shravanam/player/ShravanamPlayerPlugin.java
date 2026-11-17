package org.karatala.shravanam.player;

import android.app.Activity;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import androidx.annotation.OptIn;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.function.Consumer;

@OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "ShravanamPlayer")
public final class ShravanamPlayerPlugin extends Plugin {
    private ListenableFuture<MediaController> connection;
    private boolean destroyed;
    private boolean importing;
    private boolean choosing;
    private final ArrayDeque<ImportBatch> incoming = new ArrayDeque<>();

    private static final class ImportBatch {
        final List<Uri> uris;
        final PluginCall call;
        ImportBatch(List<Uri> uris, PluginCall call) { this.uris = uris; this.call = call; }
    }

    // Only the controller binds the service. UI destruction releases this binding, not playback.
    private void withService(Consumer<PlaybackService> action, Consumer<Exception> failed) {
        if (this.destroyed) return;
        try {
            if (this.connection != null && this.connection.isDone()) {
                boolean connected;
                try { connected = this.connection.get().isConnected(); }
                catch (Exception failure) { connected = false; }
                if (!connected) { MediaController.releaseFuture(this.connection); this.connection = null; }
            }
            if (this.connection == null) {
                SessionToken token = new SessionToken(this.getContext(), new ComponentName(this.getContext(), PlaybackService.class));
                this.connection = new MediaController.Builder(this.getContext().getApplicationContext(), token).buildAsync();
            }
            ListenableFuture<MediaController> pending = this.connection;
            pending.addListener(() -> {
                if (this.destroyed) return;
                try {
                    if (!pending.get().isConnected() || PlaybackService.instance == null) throw new IllegalStateException("Playback service is disconnected");
                    action.accept(PlaybackService.instance);
                } catch (Exception failure) { failed.accept(failure); }
            }, ContextCompat.getMainExecutor(this.getContext()));
        } catch (Exception failure) { failed.accept(failure); }
    }

    private void run(PluginCall call, Consumer<PlaybackService> action) {
        this.getActivity().runOnUiThread(() -> this.withService(action, failure -> {
            Log.e("Shravanam", "Native player request failed", failure);
            call.reject("Cannot connect to the Android player. Close and reopen the app.", failure);
        }));
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) { this.run(call, service -> call.resolve(service.snapshot())); }

    @PluginMethod
    public void playbackCommand(PluginCall call) {
        this.run(call, service -> {
            JSObject command = call.getObject("command");
            service.command(command);
            NativeVideoActivity.present(this.getActivity(), service, command);
            call.resolve(service.snapshot());
        });
    }

    @PluginMethod
    public void openBrowser(PluginCall call) {
        this.getActivity().runOnUiThread(() -> {
            try { SourceBrowserActivity.open(this.getActivity(), call.getString("url", "")); call.resolve(); }
            catch (IllegalArgumentException failure) { call.reject("Use an HTTPS address or a YouTube search."); }
        });
    }

    @PluginMethod
    public void chooseMedia(PluginCall call) {
        this.getActivity().runOnUiThread(() -> {
            if (this.choosing) { call.reject("A file picker is already open. Finish that selection first."); return; }
            this.choosing = true;
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                .putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "audio/*", "video/*", "application/ogg" })
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            try { this.startActivityForResult(call, picker, "mediaSelected"); }
            catch (Exception failure) { this.choosing = false; call.reject("Cannot open the system file picker. Enable a document provider and try again.", failure); }
        });
    }

    @ActivityCallback
    private void mediaSelected(PluginCall call, ActivityResult result) {
        this.choosing = false;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            if (call != null) this.getPlaybackState(call);
            return;
        }
        this.enqueue(result.getData(), call);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_VIEW.equals(action) && !Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        // BridgeActivity delivers the initial intent as well. Do not replay it after recreation.
        this.getActivity().setIntent(new Intent(this.getContext(), this.getActivity().getClass()).setAction(Intent.ACTION_MAIN));
        this.enqueue(intent, null);
    }

    @SuppressWarnings("deprecation")
    private void enqueue(Intent intent, PluginCall call) {
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        try {
            if (intent.getData() != null) uris.add(intent.getData());
            if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
                ArrayList<Uri> shared = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (shared != null) uris.addAll(shared);
            } else {
                Uri shared = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (shared != null) uris.add(shared);
            }
            ClipData clips = intent.getClipData();
            if (clips != null) for (int idx = 0; idx < clips.getItemCount(); idx++) if (clips.getItemAt(idx).getUri() != null) uris.add(clips.getItemAt(idx).getUri());
            uris.remove(null);
            for (Uri uri : uris) {
                if ("content".equals(uri.getScheme()) && (intent.getFlags() & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
                    try { this.getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                    catch (SecurityException failure) { Log.i("Shravanam", "The selected provider granted temporary access only"); }
                }
            }
        } catch (Exception failure) {
            Log.e("Shravanam", "Cannot receive media from this app", failure);
            if (call != null) call.reject("Cannot receive this file. Select it with Open files instead.", failure);
            return;
        }
        if (uris.isEmpty()) { if (call != null) this.getPlaybackState(call); return; }
        this.incoming.add(new ImportBatch(new ArrayList<>(uris), call));
        this.drainIncoming();
    }

    private void drainIncoming() {
        if (this.destroyed || this.importing || this.incoming.isEmpty()) return;
        this.importing = true;
        ImportBatch batch = this.incoming.remove();
        this.withService(service -> service.openUris(batch.uris, () -> {
            if (batch.call != null && !this.destroyed) batch.call.resolve(service.snapshot());
            this.importing = false;
            this.drainIncoming();
        }), failure -> {
            Log.e("Shravanam", "Cannot import Android media", failure);
            if (batch.call != null) batch.call.reject("Cannot open the Android player. Close and reopen the app, then select the file again.", failure);
            this.importing = false;
            this.drainIncoming();
        });
    }

    @Override
    protected void handleOnPause() {
        this.getActivity().runOnUiThread(() -> { if (PlaybackService.instance != null) PlaybackService.instance.saveProgress(); });
    }

    @Override
    protected void handleOnDestroy() {
        this.getActivity().runOnUiThread(() -> {
            this.destroyed = true;
            if (this.connection != null) MediaController.releaseFuture(this.connection);
            this.connection = null;
            for (ImportBatch batch : this.incoming) if (batch.call != null) batch.call.reject("The interface was closed. Select the file again after reopening it.");
            this.incoming.clear();
        });
    }
}

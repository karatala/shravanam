package org.karatala.shravanam.player;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;
import com.getcapacitor.JSObject;
import java.lang.ref.WeakReference;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;

@OptIn(markerClass = UnstableApi.class)
public final class NativeVideoActivity extends AppCompatActivity {
    private static WeakReference<NativeVideoActivity> visible = new WeakReference<>(null);
    private static final AtomicLong jobs = new AtomicLong();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private PlaybackConnection connection;
    private PlaybackService service;
    private PlaybackService lastService;
    private Player audio;
    private ExoPlayer video;
    private PlayerView picture;
    private TextView status;
    private TextView time;
    private SeekBar position;
    private Button toggle;
    private Button retry;
    private Future<?> extraction;
    private Runnable timeout;
    private boolean resumed;
    private boolean dragging;
    private boolean frame;
    private boolean failed;
    private long generation;
    private long owner;
    private long revision;
    private long bufferStarted;
    private long bufferTime;
    private long sampleTime;
    private long samplePosition;
    private boolean samplePlaying;
    private float sampleSpeed;
    private String expectedId = "";
    private String loadedId = "";
    private final Runnable update = new Runnable() {
        @Override public void run() {
            if (!NativeVideoActivity.this.resumed || NativeVideoActivity.this.service == null) return;
            NativeVideoActivity.this.synchronize();
            NativeVideoActivity.this.handler.postDelayed(this, 50);
        }
    };

    static void present(Activity activity, PlaybackService service, JSObject command) {
        String type = command.getString("type", "");
        if (!type.equals("audio-only") && !type.equals("open-youtube")) return;
        if (!service.wantsVideo()) {
            NativeVideoActivity current = visible.get();
            if (current != null) current.finish();
            return;
        }
        String target = service.currentMedia() == null ? "" : service.currentMedia().id;
        if (type.equals("open-youtube")) {
            try { target = YouTubeSource.parse(command.getString("url", "")).id; }
            catch (IllegalArgumentException failure) { return; }
        }
        if (!target.isEmpty()) activity.startActivity(new Intent(activity, NativeVideoActivity.class).putExtra("media-id", target).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    private String text(String english, String russian) { return NativeControls.text(this, english, russian); }

    @Override public void onCreate(Bundle savedState) {
        this.setTheme(com.getcapacitor.android.R.style.AppTheme_NoActionBar);
        super.onCreate(savedState);
        visible = new WeakReference<>(this);
        this.expectedId = this.getIntent().getStringExtra("media-id");
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.BLACK);
        this.status = new TextView(this);
        this.status.setTextColor(Color.LTGRAY);
        this.status.setTextSize(12);
        this.status.setPadding(12, 8, 12, 8);
        root.addView(this.status);
        this.picture = (PlayerView) this.getLayoutInflater().inflate(R.layout.shravanam_video, root, false);
        root.addView(this.picture, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        this.time = new TextView(this);
        this.time.setTextColor(Color.LTGRAY);
        this.time.setTextSize(12);
        root.addView(this.time);
        this.position = new SeekBar(this);
        this.position.setMax(1000);
        this.position.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onStartTrackingTouch(SeekBar slider) { NativeVideoActivity.this.dragging = true; }
            @Override public void onProgressChanged(SeekBar slider, int value, boolean user) {}
            @Override public void onStopTrackingTouch(SeekBar slider) {
                if (NativeVideoActivity.this.audio != null && NativeVideoActivity.this.audio.getDuration() > 0) NativeVideoActivity.this.audio.seekTo(NativeVideoActivity.this.audio.getDuration() * slider.getProgress() / 1000);
                NativeVideoActivity.this.dragging = false;
            }
        });
        root.addView(this.position);
        LinearLayout controls = new LinearLayout(this);
        controls.addView(NativeControls.button(this, "−", view -> { if (this.audio != null) this.audio.seekBack(); }));
        this.toggle = NativeControls.button(this, text("Play", "Пуск"), view -> { if (this.service != null) this.service.command(new JSObject().put("type", "toggle")); });
        controls.addView(this.toggle);
        controls.addView(NativeControls.button(this, "+", view -> { if (this.audio != null) this.audio.seekForward(); }));
        controls.addView(NativeControls.button(this, text("Listen", "Звук"), view -> { if (this.service != null) this.service.command(new JSObject().put("type", "audio-only").put("value", true)); this.finish(); }));
        controls.addView(NativeControls.button(this, text("Browser", "Браузер"), view -> SourceBrowserActivity.open(this, "")));
        root.addView(controls);
        this.retry = NativeControls.button(this, text("Retry video", "Повторить видео"), view -> { this.resetVideo(); this.loadedId = ""; });
        this.retry.setVisibility(View.GONE);
        root.addView(this.retry);
        this.setContentView(root);
        NativeControls.insets(root);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        this.setIntent(intent);
        this.expectedId = intent.getStringExtra("media-id");
        this.resetVideo();
        this.loadedId = "";
        if (this.service != null) { this.revision = this.service.videoRevision(); this.owner = this.service.claimVideo(); }
    }

    @Override protected void onResume() {
        super.onResume();
        if (this.connection != null) this.connection.close();
        this.handler.removeCallbacks(this.update);
        this.resetVideo();
        if (this.service != null) this.service.releaseVideo(this.owner, this.revision, false);
        this.service = null;
        this.audio = null;
        this.resumed = true;
        this.status.setText(text("Connecting to the player…", "Подключение к плееру…"));
        this.connection = new PlaybackConnection(this, connected -> {
            if (!connected.wantsVideo()) { this.finish(); return; }
            this.service = connected;
            this.lastService = connected;
            this.audio = connected.sessionPlayer();
            this.revision = connected.videoRevision();
            this.owner = connected.claimVideo();
            this.loadedId = "";
            this.handler.post(this.update);
        }, () -> this.status.setText(text("Cannot connect to the player. Return and open the media again.", "Не удалось подключиться к плееру. Вернитесь и откройте медиа снова.")));
    }

    @Override protected void onPause() {
        this.resumed = false;
        this.handler.removeCallbacks(this.update);
        this.resetVideo();
        if (this.service != null) this.service.releaseVideo(this.owner, this.revision, this.isFinishing() && !this.isChangingConfigurations());
        this.service = null;
        this.audio = null;
        if (this.connection != null) this.connection.close();
        this.connection = null;
        this.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (this.isFinishing() && this.lastService != null) this.lastService.releaseVideo(0, this.revision, true);
        this.worker.shutdownNow();
        if (visible.get() == this) visible.clear();
        super.onDestroy();
    }

    private void resetVideo() {
        ++this.generation;
        if (this.extraction != null) this.extraction.cancel(true);
        this.extraction = null;
        if (this.timeout != null) this.handler.removeCallbacks(this.timeout);
        this.timeout = null;
        if (this.picture != null) { this.picture.setPlayer(null); this.picture.setAlpha(0); }
        if (this.video != null) this.video.release();
        this.video = null;
        this.frame = false;
        this.failed = false;
        this.bufferStarted = 0;
        this.bufferTime = 0;
        this.sampleTime = 0;
        this.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void loadVideo(MediaFile file) {
        this.resetVideo();
        this.loadedId = file.id;
        this.retry.setVisibility(View.GONE);
        this.service.videoStatus(this.owner, this.revision, true, false);
        this.video = new ExoPlayer.Builder(this).build();
        this.video.setAudioAttributes(new AudioAttributes.Builder().build(), false);
        this.video.setTrackSelectionParameters(this.video.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true).setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
        long version = this.generation;
        this.video.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (!NativeVideoActivity.this.resumed || version != NativeVideoActivity.this.generation) return;
                if (state == Player.STATE_READY && !NativeVideoActivity.this.video.getCurrentTracks().isTypeSelected(C.TRACK_TYPE_VIDEO)) { NativeVideoActivity.this.videoFailed(); return; }
                if (state == Player.STATE_BUFFERING) NativeVideoActivity.this.bufferStarted = SystemClock.elapsedRealtime();
                if (state == Player.STATE_READY && NativeVideoActivity.this.bufferStarted > 0) { NativeVideoActivity.this.bufferTime = SystemClock.elapsedRealtime() - NativeVideoActivity.this.bufferStarted; NativeVideoActivity.this.bufferStarted = 0; }
            }
            @Override public void onRenderedFirstFrame() { if (NativeVideoActivity.this.resumed && version == NativeVideoActivity.this.generation) NativeVideoActivity.this.frame = true; }
            @Override public void onPlayerError(PlaybackException failure) { if (NativeVideoActivity.this.resumed && version == NativeVideoActivity.this.generation) NativeVideoActivity.this.videoFailed(); }
        });
        this.picture.setPlayer(this.video);
        if (!file.youtube()) { this.prepareVideo(file, null, version); return; }
        String job = "shravanam-video-" + jobs.incrementAndGet();
        this.extraction = this.worker.submit(() -> {
            try {
                YouTubeResolver.Stream stream = YouTubeResolver.resolveVideo(this, YouTubeSource.parse(file.uri.toString()), job);
                this.handler.post(() -> this.prepareVideo(file, stream, version));
            } catch (Exception failure) { this.handler.post(() -> { if (this.resumed && version == this.generation) this.videoFailed(); }); }
        });
        this.timeout = () -> { if (this.resumed && version == this.generation) { if (this.extraction != null) this.extraction.cancel(true); ++this.generation; this.videoFailed(); } };
        this.handler.postDelayed(this.timeout, 60000);
    }

    private void prepareVideo(MediaFile file, YouTubeResolver.Stream stream, long version) {
        if (!this.resumed || version != this.generation || this.service == null || PlaybackService.instance != this.service || this.video == null || this.service.currentMedia() == null || !file.id.equals(this.service.currentMedia().id)) return;
        if (this.timeout != null) this.handler.removeCallbacks(this.timeout);
        this.timeout = null;
        try {
            MediaItem item = new MediaItem.Builder().setMediaId(file.id).setUri(stream == null ? file.uri.toString() : stream.url).build();
            DefaultMediaSourceFactory factory = new DefaultMediaSourceFactory(this);
            if (stream != null) factory.setDataSourceFactory(new DefaultDataSource.Factory(this, new DefaultHttpDataSource.Factory().setDefaultRequestProperties(stream.headers)));
            this.video.setMediaSource(factory.createMediaSource(item), Math.max(0, this.audio.getCurrentPosition()));
            this.video.prepare();
        } catch (RuntimeException failure) { this.videoFailed(); }
    }

    private void videoFailed() {
        this.failed = true;
        if (this.video != null) this.video.pause();
        this.picture.setAlpha(0);
        this.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        this.status.setText(text("Cannot open video. Audio keeps playing. Retry or select Listen.", "Не удалось открыть видео. Звук продолжает идти. Повторите попытку или выберите «Звук»."));
        this.retry.setVisibility(View.VISIBLE);
        if (this.service != null) this.service.videoStatus(this.owner, this.revision, false, true);
    }

    private static String clock(long value) { long seconds = Math.max(0, value / 1000); return String.format(Locale.ROOT, "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60); }

    private void seekVideo(long target) {
        this.video.pause();
        this.frame = false;
        long duration = this.video.getDuration();
        this.video.seekTo(Math.max(0, duration > 0 ? Math.min(target, duration - 1) : target));
        this.picture.setAlpha(0);
    }

    private void synchronize() {
        if (this.service == null || this.audio == null) return;
        if (PlaybackService.instance != this.service || !this.service.wantsVideo()) { this.finish(); return; }
        NativeControls.label(this.toggle, this.service.paused() ? text("Play", "Пуск") : text("Pause", "Пауза"));
        MediaFile file = this.service.currentMedia();
        if (file != null && !this.service.openingMedia() && !this.service.failed() && this.expectedId != null && !this.expectedId.equals(file.id)) this.expectedId = file.id;
        if (file == null || (this.expectedId != null && !this.expectedId.equals(file.id))) {
            if (this.video != null) this.video.pause();
            this.picture.setAlpha(0);
            this.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            this.status.setText(this.service.failed() && !this.service.openingMedia() ? text("Cannot open the selected source. Return and try again.", "Не удалось открыть выбранный источник. Вернитесь и повторите попытку.") : text("Opening media. Audio remains in the player…", "Открытие медиа. Звук остаётся в плеере…"));
            return;
        }
        if (!file.kind.equals("video")) { this.status.setText(text("This file has no video. Select Listen to return.", "В этом файле нет видео. Выберите «Звук», чтобы вернуться.")); return; }
        if (!file.id.equals(this.loadedId)) this.loadVideo(file);
        long duration = this.audio.getDuration();
        if (!this.dragging) { NativeControls.label(this.time, clock(this.audio.getCurrentPosition()) + " / " + clock(duration)); this.position.setProgress(duration > 0 ? (int) (this.audio.getCurrentPosition() * 1000 / duration) : 0); }
        this.position.setEnabled(duration > 0);
        if (this.video == null || this.failed) return;
        boolean playing = this.audio.getPlayWhenReady() && this.audio.getPlaybackState() == Player.STATE_READY;
        long now = SystemClock.elapsedRealtime();
        long audioPosition = Math.max(0, this.audio.getCurrentPosition());
        boolean jumped = this.sampleTime > 0 && VideoSync.jumped(this.samplePosition, audioPosition, now - this.sampleTime, this.samplePlaying, this.sampleSpeed);
        this.sampleTime = now;
        this.samplePosition = audioPosition;
        this.samplePlaying = playing;
        this.sampleSpeed = this.audio.getPlaybackParameters().speed;
        if (jumped) { this.seekVideo(VideoSync.seekTarget(audioPosition, playing, this.bufferTime, this.sampleSpeed)); return; }
        if (this.audio.getPlaybackState() == Player.STATE_ENDED || (this.video.getPlaybackState() == Player.STATE_ENDED && this.video.getDuration() > 0 && audioPosition >= this.video.getDuration() - 100)) {
            this.video.pause();
            this.picture.setAlpha(this.frame ? 1 : 0);
            this.service.videoStatus(this.owner, this.revision, false, false);
            this.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            return;
        }
        boolean ready = (this.video.getPlaybackState() == Player.STATE_READY || this.video.getPlaybackState() == Player.STATE_ENDED) && this.frame && this.audio.getPlaybackState() != Player.STATE_BUFFERING && this.audio.getPlayerError() == null;
        VideoSync.Decision decision = VideoSync.decide(Math.max(0, this.audio.getCurrentPosition()), Math.max(0, this.video.getCurrentPosition()), ready, playing, this.bufferTime, this.audio.getPlaybackParameters().speed);
        if (decision.seekTo >= 0) this.seekVideo(decision.seekTo);
        else {
            if (this.video.getPlaybackParameters().speed != this.audio.getPlaybackParameters().speed) this.video.setPlaybackSpeed(this.audio.getPlaybackParameters().speed);
            this.video.setPlayWhenReady(decision.play);
        }
        this.picture.setAlpha(decision.show ? 1 : 0);
        NativeControls.label(this.status, decision.show ? file.name : text("Preparing synchronized video; audio keeps playing…", "Подготовка видео к текущей позиции; звук продолжает идти…"));
        this.service.videoStatus(this.owner, this.revision, !decision.show, false);
        if (playing) this.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else this.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (this.audio != null && event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0 && !(this.getCurrentFocus() instanceof SeekBar) && !event.isAltPressed() && !event.isCtrlPressed() && !event.isMetaPressed()) {
            if (event.getKeyCode() == KeyEvent.KEYCODE_SPACE) { this.service.command(new JSObject().put("type", "toggle")); return true; }
            if (event.getKeyCode() == KeyEvent.KEYCODE_DPAD_LEFT) { this.audio.seekBack(); return true; }
            if (event.getKeyCode() == KeyEvent.KEYCODE_DPAD_RIGHT) { this.audio.seekForward(); return true; }
        }
        return super.dispatchKeyEvent(event);
    }
}

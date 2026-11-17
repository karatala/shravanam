package org.karatala.shravanam.player;

import android.app.PendingIntent;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.os.CancellationSignal;
import android.util.Log;
import android.view.KeyEvent;
import android.widget.Toast;
import androidx.annotation.OptIn;
import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingSimpleBasePlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.session.CommandButton;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.MediaStyleNotificationHelper;
import androidx.media3.session.SessionCommands;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONObject;
import org.json.JSONArray;

@OptIn(markerClass = UnstableApi.class)
public final class PlaybackService extends MediaSessionService {
    private static final AtomicLong youtubeJobs = new AtomicLong();
    // Accessed only on the main thread. The controller binding owns the UI connection.
    static PlaybackService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService fileWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService youtubeWorker = Executors.newSingleThreadExecutor();
    private final LinkedHashMap<String, MediaFile> files = new LinkedHashMap<>();
    private final ArrayList<MediaFile> recent = new ArrayList<>();
    private final ArrayList<MediaFile> recentLinks = new ArrayList<>();
    private Future<?> youtubeTask;
    private Runnable youtubeTimeout;
    private boolean resolvingYouTube;
    private boolean selectionAutoplay;
    private boolean videoRequested;
    private boolean videoLoading;
    private JSObject videoError;
    private long videoRevision;
    private long videoOwner;
    private long videoOwners;
    private ExoPlayer player;
    private SessionPlayer controls;
    private MediaSession session;
    private SharedPreferences settings;
    private JSONObject types;
    private MediaFile current;
    private JSObject error;
    private int backward;
    private int forward;
    private boolean destroyed;
    private boolean changingMedia;
    private boolean openingFile;
    private long selectionVersion;
    private MediaFile resuming;
    private MediaItem resumeItem;
    private long resumePosition;
    private PlaybackException resumeError;
    private boolean resumeForeground;
    private boolean resumePlayRequested;
    private MediaFile resumeNotificationFile;
    private Runnable resumeTimeout;
    private String startupId = "";
    private boolean dispatchingPlay;
    private CancellationSignal pendingRead;
    private boolean startupRestored;
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) return;
            PlaybackService.this.selectionAutoplay = false;
            PlaybackService.this.controls.pause();
        }
    };
    private final Runnable checkpoint = new Runnable() {
        @Override public void run() {
            PlaybackService.this.saveProgress();
            PlaybackService.this.handler.postDelayed(this, 5000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        this.settings = this.getSharedPreferences("shravanam.playback", MODE_PRIVATE);
        this.backward = Math.max(1, Math.min(600, this.settings.getInt("backward", 15)));
        this.forward = Math.max(1, Math.min(600, this.settings.getInt("forward", 30)));
        try {
            JSONArray saved = new JSONArray(this.settings.getString("recent", "[]"));
            for (int idx = 0; idx < Math.min(20, saved.length()); idx++) {
                MediaFile file = MediaFile.fromStored(saved.getJSONObject(idx));
                if (file.youtube()) continue;
                boolean duplicate = false;
                for (MediaFile existing : this.recent) if (existing.uri.equals(file.uri)) duplicate = true;
                if (!duplicate) this.recent.add(file);
            }
        } catch (Exception failure) { Log.e("Shravanam", "Cannot read recent files", failure); this.error = PlaybackService.failure("storage", null); }
        try {
            JSONArray saved = new JSONArray(this.settings.getString("recent-youtube", "[]"));
            for (int idx = 0; idx < Math.min(20, saved.length()); idx++) {
                MediaFile file = MediaFile.fromStored(saved.getJSONObject(idx));
                if (file.youtube() && this.recentLinks.stream().noneMatch(existing -> existing.id.equals(file.id))) this.recentLinks.add(file);
            }
        } catch (Exception failure) { Log.e("Shravanam", "Cannot read recent YouTube links"); this.error = PlaybackService.failure("storage", null); }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(this.getResources().openRawResource(R.raw.shravanam_media_types), StandardCharsets.UTF_8))) {
            StringBuilder json = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) json.append(line);
            this.types = new JSONObject(json.toString());
        } catch (Exception failure) { throw new IllegalStateException("Missing packaged media types", failure); }
        this.player = new ExoPlayer.Builder(this)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true)
            .setHandleAudioBecomingNoisy(true).setWakeMode(C.WAKE_MODE_LOCAL).build();
        this.player.setTrackSelectionParameters(this.player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, true).setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
        float speed = this.settings.getFloat("speed", 1);
        this.player.setPlaybackSpeed(Float.isFinite(speed) ? Math.max(0.25f, Math.min(3, speed)) : 1);
        this.controls = new SessionPlayer();
        this.setMediaNotificationProvider(new DefaultMediaNotificationProvider.Builder(this).setChannelId("shravanam.playback").setChannelName(R.string.shravanam_playback_channel).build());
        MediaSession.Builder builder = new MediaSession.Builder(this, this.controls).setShowPlayButtonIfPlaybackIsSuppressed(true).setCallback(new MediaSession.Callback() {
            @Override public MediaSession.ConnectionResult onConnect(MediaSession session, MediaSession.ControllerInfo controller) {
                if (!controller.isTrusted() && !session.isMediaNotificationController(controller)) return MediaSession.ConnectionResult.reject();
                Player.Commands allowed = new Player.Commands.Builder().addAll(
                    Player.COMMAND_PLAY_PAUSE, Player.COMMAND_PREPARE, Player.COMMAND_STOP,
                    Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD,
                    Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                    Player.COMMAND_GET_CURRENT_MEDIA_ITEM, Player.COMMAND_GET_TIMELINE, Player.COMMAND_GET_METADATA, Player.COMMAND_GET_AUDIO_ATTRIBUTES, Player.COMMAND_GET_TRACKS).build();
                return MediaSession.ConnectionResult.accept(SessionCommands.EMPTY, allowed);
            }
            @Override public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onPlaybackResumption(MediaSession session, MediaSession.ControllerInfo controller, boolean isForPlayback) {
                return Futures.immediateFuture(PlaybackService.this.resumptionItems(isForPlayback));
            }
            @Override public boolean onMediaButtonEvent(MediaSession session, MediaSession.ControllerInfo controller, Intent intent) {
                return intent.getBooleanExtra(ResumeMediaButtonReceiver.RESUME_REQUEST, false) && intent.getLongExtra(ResumeMediaButtonReceiver.RESUME_VERSION, PlaybackService.this.selectionVersion) != PlaybackService.this.selectionVersion;
            }
        });
        Intent launch = this.getPackageManager().getLaunchIntentForPackage(this.getPackageName());
        if (launch != null) builder.setSessionActivity(PendingIntent.getActivity(this, 0, launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        this.session = builder.build();
        this.setListener(new MediaSessionService.Listener() {
            @Override public void onForegroundServiceStartNotAllowedException() { PlaybackService.this.resumePlayRequested = true; PlaybackService.this.failResumption("play", null); }
        });
        this.updateButtons();
        // Also cancel pending autoplay before the first file/URL has reached ExoPlayer.
        ContextCompat.registerReceiver(this, this.noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
        this.player.addListener(new Player.Listener() {
            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                if (!ready && !PlaybackService.this.changingMedia) {
                    PlaybackService.this.selectionAutoplay = false;
                    PlaybackService.this.controls.refresh();
                }
            }
            @Override public void onPlaybackSuppressionReasonChanged(int reason) {
                if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
                    PlaybackService.this.selectionAutoplay = false;
                    PlaybackService.this.controls.refresh();
                }
            }
            @Override public void onPlayerError(PlaybackException failure) {
                if (PlaybackService.this.current != null && PlaybackService.this.current.youtube()) Log.e("Shravanam", "YouTube playback failed: " + failure.errorCode);
                else Log.e("Shravanam", "Android playback failed", failure);
                PlaybackService.this.error = PlaybackService.failure(failure.errorCode == PlaybackException.ERROR_CODE_IO_NO_PERMISSION ? "access" : "play", PlaybackService.this.current == null ? null : PlaybackService.this.current.name);
                if (PlaybackService.this.current != null && PlaybackService.this.current.youtube()) PlaybackService.this.settings.edit().putLong("position." + PlaybackService.this.current.id, Math.max(0, PlaybackService.this.player.getCurrentPosition())).apply();
                PlaybackService.this.failResumption("play", PlaybackService.this.current == null ? null : PlaybackService.this.current.name);
            }
            @Override public void onEvents(Player player, Player.Events events) {
                if (events.containsAny(Player.EVENT_POSITION_DISCONTINUITY, Player.EVENT_PLAY_WHEN_READY_CHANGED, Player.EVENT_PLAYBACK_STATE_CHANGED, Player.EVENT_PLAYBACK_PARAMETERS_CHANGED)) {
                    boolean flush = !PlaybackService.this.changingMedia && ((!player.getPlayWhenReady() && events.contains(Player.EVENT_PLAY_WHEN_READY_CHANGED)) || player.getPlaybackState() == Player.STATE_ENDED);
                    PlaybackService.this.saveProgress(flush);
                }
                PlaybackService.this.finishResumeNotification();
            }
        });
        PlaybackService.instance = this;
        this.handler.postDelayed(this.checkpoint, 5000);
    }

    private void restoreForInterface() {
        this.startupRestored = true;
        if (this.selectionVersion != 0 || this.current != null || this.openingFile || this.resolvingYouTube) return;
        MediaFile last = SavedPlayback.last(this.settings);
        if (last == null && !this.recent.isEmpty()) last = this.recent.get(0);
        if (last == null && !this.recentLinks.isEmpty()) last = this.recentLinks.get(0);
        if (last != null) { this.startupId = last.id; this.openRecent(last.id, true); }
    }

    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controller) {
        if (!this.startupRestored && !this.resumeForeground && controller.getUid() == android.os.Process.myUid() && !this.session.isMediaNotificationController(controller)) this.restoreForInterface();
        return this.session;
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (SavedPlayback.playRequest(intent) && intent.getBooleanExtra(ResumeMediaButtonReceiver.RESUME_REQUEST, false) && !this.resumeForeground) {
            MediaFile saved = this.current != null ? this.current : SavedPlayback.last(this.settings);
            if (!this.startResumeNotification(saved)) return START_NOT_STICKY;
            if (saved == null && !this.openingFile && !this.resolvingYouTube) { this.resumePlayRequested = true; this.failResumption("open", null); return START_NOT_STICKY; }
        }
        if (intent != null && intent.getBooleanExtra(ResumeMediaButtonReceiver.RESUME_REQUEST, false)) intent.putExtra(ResumeMediaButtonReceiver.RESUME_VERSION, this.selectionVersion);
        return super.onStartCommand(intent, flags, startId);
    }

    @SuppressLint("MissingPermission") // MediaStyle notifications are exempt from POST_NOTIFICATIONS.
    @Override public ListenableFuture<Void> onUpdateNotificationAsync(MediaSession session, boolean startInForegroundRequired) {
        if (this.resumeForeground) {
            NotificationManagerCompat.from(this).notify(DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID, this.resumeNotification());
            return Futures.immediateVoidFuture();
        }
        return super.onUpdateNotificationAsync(session, startInForegroundRequired);
    }

    MediaSession.MediaItemsWithStartPosition resumptionItems(boolean forPlayback) {
        MediaFile saved = SavedPlayback.last(this.settings);
        if (forPlayback && (this.openingFile || this.resolvingYouTube) && (saved == null || !saved.id.equals(this.startupId))) return new MediaSession.MediaItemsWithStartPosition(ImmutableList.of(), C.INDEX_UNSET, C.TIME_UNSET);
        if (saved == null || (forPlayback && !SavedPlayback.readable(this, saved))) {
            if (forPlayback) { this.resumePlayRequested = true; this.failResumption("access", saved == null ? null : saved.name); }
            return new MediaSession.MediaItemsWithStartPosition(ImmutableList.of(), C.INDEX_UNSET, C.TIME_UNSET);
        }
        MediaItem item = new MediaItem.Builder().setMediaId(saved.id).setMediaMetadata(this.metadata(saved)).build();
        if (forPlayback && (this.openingFile || this.resolvingYouTube) && this.current == null) {
            this.resuming = saved;
            this.resumeItem = item;
            this.resumePosition = SavedPlayback.position(this.settings, saved);
            this.files.put(saved.id, saved);
            this.controls.refresh();
        }
        return new MediaSession.MediaItemsWithStartPosition(ImmutableList.of(item), 0, SavedPlayback.position(this.settings, saved));
    }

    private boolean startResumeNotification(MediaFile saved) {
        this.resumeNotificationFile = saved;
        try {
            if (Build.VERSION.SDK_INT >= 26) this.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("shravanam.playback", this.getString(R.string.shravanam_playback_channel), NotificationManager.IMPORTANCE_LOW));
            ServiceCompat.startForeground(this, DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID, this.resumeNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            this.resumeForeground = true;
            this.resumePlayRequested = false;
            this.setForegroundServiceTimeoutMs(0);
            this.resumeTimeout = () -> { this.resumePlayRequested = true; this.failResumption(saved != null && saved.youtube() ? "youtube" : "open", saved == null ? null : saved.name); };
            this.handler.postDelayed(this.resumeTimeout, 60000);
            return true;
        } catch (IllegalStateException | SecurityException failure) {
            ++this.selectionVersion;
            this.cancelYouTube();
            this.openingFile = false;
            this.selectionAutoplay = false;
            this.error = PlaybackService.failure("play", saved == null ? null : saved.name);
            Toast.makeText(this, R.string.shravanam_resume_background, Toast.LENGTH_LONG).show();
            this.stopSelf();
            return false;
        }
    }

    private android.app.Notification resumeNotification() {
        MediaFile file = this.resumeNotificationFile;
        int playKey = this.selectionAutoplay ? KeyEvent.KEYCODE_MEDIA_PAUSE : KeyEvent.KEYCODE_MEDIA_PLAY;
        int playIcon = new CommandButton.Builder(this.selectionAutoplay ? CommandButton.ICON_PAUSE : CommandButton.ICON_PLAY).setPlayerCommand(Player.COMMAND_PLAY_PAUSE).build().iconResId;
        int stopIcon = new CommandButton.Builder(CommandButton.ICON_STOP).setPlayerCommand(Player.COMMAND_STOP).build().iconResId;
        return new NotificationCompat.Builder(this, "shravanam.playback").setSmallIcon(androidx.media3.session.R.drawable.media3_notification_small_icon)
            .setContentTitle(file == null ? this.getApplicationInfo().loadLabel(this.getPackageManager()) : file.name).setContentText(this.getString(R.string.shravanam_resume_loading))
            .setContentIntent(this.session.getSessionActivity()).setOnlyAlertOnce(true).setOngoing(true).setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE).setStyle(new MediaStyleNotificationHelper.MediaStyle(this.session).setShowActionsInCompactView(0, 1))
            .addAction(playIcon, this.getString(this.selectionAutoplay ? R.string.shravanam_resume_pause : R.string.shravanam_resume_play), this.resumeAction(playKey))
            .addAction(stopIcon, this.getString(R.string.shravanam_resume_stop), this.resumeAction(KeyEvent.KEYCODE_MEDIA_STOP)).build();
    }

    private PendingIntent resumeAction(int key) {
        Intent intent = new Intent(this, PlaybackService.class).setAction(Intent.ACTION_MEDIA_BUTTON).putExtra(Intent.EXTRA_KEY_EVENT, new KeyEvent(KeyEvent.ACTION_DOWN, key));
        return PendingIntent.getService(this, key, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private boolean beginResumption(MediaFile saved) {
        if (!SavedPlayback.readable(this, saved)) { this.failResumption("access", saved.name); return false; }
        if (!this.resumeForeground && !this.startResumeNotification(saved)) return false;
        this.startupRestored = true;
        this.resuming = saved;
        this.resumeItem = new MediaItem.Builder().setMediaId(saved.id).setMediaMetadata(this.metadata(saved)).build();
        this.resumePosition = SavedPlayback.position(this.settings, saved);
        this.resumeError = null;
        this.files.put(saved.id, saved);
        this.openRecent(saved.id, true);
        return true;
    }

    private void finishResumeNotification() {
        if (!this.resumeForeground || !this.resumePlayRequested || this.resuming != null || this.openingFile || this.resolvingYouTube || this.current == null || this.player.getMediaItemCount() == 0) return;
        if (this.dispatchingPlay || this.changingMedia || this.player.getPlaybackState() == Player.STATE_IDLE) return;
        this.resumeForeground = false;
        this.resumeNotificationFile = null;
        if (this.resumeTimeout != null) this.handler.removeCallbacks(this.resumeTimeout);
        this.resumeTimeout = null;
        this.triggerNotificationUpdate();
    }

    private void acceptedResumption(MediaFile file) {
        this.startupId = "";
        if (this.resuming != null && this.resuming.id.equals(file.id)) { this.resuming = null; this.resumeItem = null; this.resumeError = null; this.controls.refresh(); }
        this.finishResumeNotification();
    }

    private void dismissResumption(boolean stop) {
        this.startupRestored = true;
        this.startupId = "";
        if (this.resuming == null && !this.resumeForeground) return;
        boolean foreground = this.resumeForeground;
        this.resuming = null;
        this.resumeItem = null;
        this.resumeError = null;
        this.resumeForeground = false;
        this.resumePlayRequested = false;
        this.resumeNotificationFile = null;
        if (this.resumeTimeout != null) this.handler.removeCallbacks(this.resumeTimeout);
        this.resumeTimeout = null;
        if (foreground) { this.stopForeground(STOP_FOREGROUND_REMOVE); if (stop) this.stopSelf(); }
        this.controls.refresh();
    }

    private void failResumption(String code, String name) {
        if (!this.resumeForeground && this.resuming == null) return;
        if (this.resumeForeground && !this.resumePlayRequested) return;
        ++this.selectionVersion;
        this.selectionAutoplay = false;
        this.openingFile = false;
        this.cancelFileRead();
        this.cancelYouTube();
        this.resumeError = new PlaybackException(this.getString(R.string.shravanam_resume_failed), null, PlaybackException.ERROR_CODE_IO_UNSPECIFIED);
        this.error = PlaybackService.failure(code, name);
        this.controls.refresh();
        boolean foreground = this.resumeForeground;
        this.resumeForeground = false;
        if (this.resumeTimeout != null) this.handler.removeCallbacks(this.resumeTimeout);
        this.resumeTimeout = null;
        if (foreground) { this.stopForeground(STOP_FOREGROUND_REMOVE); this.stopSelf(); }
        Toast.makeText(this, R.string.shravanam_resume_failed, Toast.LENGTH_LONG).show();
    }

    private void cancelFileRead() {
        CancellationSignal pending = this.pendingRead;
        this.pendingRead = null;
        if (pending != null) pending.cancel();
    }

    // SimpleBasePlayer keeps command and interval change events consistent with its getters.
    private final class SessionPlayer extends ForwardingSimpleBasePlayer {
        SessionPlayer() { super(PlaybackService.this.player); }

        @Override protected State getState() {
            State state = super.getState();
            Commands.Builder commands = state.availableCommands.buildUpon();
            if (state.availableCommands.contains(COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)) commands.addAll(COMMAND_SEEK_TO_PREVIOUS, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, COMMAND_SEEK_TO_NEXT, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM);
            State.Builder result = state.buildUpon().setAvailableCommands(commands.build()).setSeekBackIncrementMs(PlaybackService.this.backward * 1000L).setSeekForwardIncrementMs(PlaybackService.this.forward * 1000L);
            if (PlaybackService.this.resuming != null) {
                boolean loading = PlaybackService.this.openingFile || PlaybackService.this.resolvingYouTube;
                commands.removeAll(COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, COMMAND_SEEK_BACK, COMMAND_SEEK_FORWARD, COMMAND_SEEK_TO_PREVIOUS, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, COMMAND_SEEK_TO_NEXT, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM, COMMAND_SEEK_TO_DEFAULT_POSITION, COMMAND_SEEK_TO_MEDIA_ITEM);
                return result.setAvailableCommands(commands.build()).setPlaylist(ImmutableList.of(new MediaItemData.Builder(PlaybackService.this.resuming.id).setMediaItem(PlaybackService.this.resumeItem).build()))
                    .setCurrentMediaItemIndex(0).setContentPositionMs(PlaybackService.this.resumePosition).setContentBufferedPositionMs(PositionSupplier.getConstant(PlaybackService.this.resumePosition)).setTotalBufferedDurationMs(PositionSupplier.ZERO)
                    .setPlayerError(PlaybackService.this.resumeError).setPlaybackState(loading ? STATE_BUFFERING : STATE_IDLE).setIsLoading(loading)
                    .setPlayWhenReady(loading && PlaybackService.this.selectionAutoplay, PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST).build();
            }
            if (PlaybackService.this.pendingWithoutAudio() || PlaybackService.this.player.getPlaybackState() == STATE_ENDED || PlaybackService.this.player.getPlayerError() != null) result.setPlayWhenReady(!PlaybackService.this.paused(), PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST);
            return result.build();
        }

        @Override protected ListenableFuture<?> handleSetMediaItems(List<MediaItem> items, int startIndex, long startPositionMs) {
            if (items.isEmpty()) return Futures.immediateVoidFuture();
            MediaFile saved = SavedPlayback.last(PlaybackService.this.settings);
            if (items.size() != 1 || items.get(0).localConfiguration != null || saved == null || !saved.id.equals(items.get(0).mediaId)) return Futures.immediateFailedFuture(new IllegalArgumentException("Only the saved source can be resumed"));
            if (PlaybackService.this.resuming != null && PlaybackService.this.resuming.id.equals(saved.id) && (PlaybackService.this.openingFile || PlaybackService.this.resolvingYouTube)) return Futures.immediateVoidFuture();
            PlaybackService.this.beginResumption(saved);
            return Futures.immediateVoidFuture();
        }

        @Override protected ListenableFuture<?> handleSeek(int mediaItemIndex, long positionMs, int seekCommand) {
            if (seekCommand == COMMAND_SEEK_BACK || seekCommand == COMMAND_SEEK_TO_PREVIOUS || seekCommand == COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) PlaybackService.this.seekBy(-PlaybackService.this.backward * 1000L);
            else if (seekCommand == COMMAND_SEEK_FORWARD || seekCommand == COMMAND_SEEK_TO_NEXT || seekCommand == COMMAND_SEEK_TO_NEXT_MEDIA_ITEM) PlaybackService.this.seekBy(PlaybackService.this.forward * 1000L);
            else return super.handleSeek(mediaItemIndex, positionMs, seekCommand);
            return Futures.immediateVoidFuture();
        }

        @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean ready) {
            PlaybackService.this.dispatchingPlay = true;
            try { return this.setPlaybackReady(ready); }
            finally { PlaybackService.this.dispatchingPlay = false; PlaybackService.this.finishResumeNotification(); }
        }

        private ListenableFuture<?> setPlaybackReady(boolean ready) {
            if (!ready && PlaybackService.this.resumeForeground && !PlaybackService.this.resumePlayRequested) {
                ++PlaybackService.this.selectionVersion;
                PlaybackService.this.selectionAutoplay = false;
                PlaybackService.this.cancelYouTube();
                PlaybackService.this.cancelFileRead();
                PlaybackService.this.openingFile = false;
                PlaybackService.this.player.pause();
                PlaybackService.this.dismissResumption(true);
                return Futures.immediateVoidFuture();
            }
            if (PlaybackService.this.resumeForeground) {
                if (ready) PlaybackService.this.resumePlayRequested = true;
                PlaybackService.this.selectionAutoplay = ready;
            }
            if (PlaybackService.this.resuming != null) {
                if (ready && !PlaybackService.this.openingFile && !PlaybackService.this.resolvingYouTube && !PlaybackService.this.beginResumption(PlaybackService.this.resuming)) return Futures.immediateVoidFuture();
                if (ready && PlaybackService.this.resumeForeground) PlaybackService.this.resumePlayRequested = true;
                PlaybackService.this.selectionAutoplay = ready;
                return Futures.immediateVoidFuture();
            }
            if (PlaybackService.this.openingFile || PlaybackService.this.resolvingYouTube) PlaybackService.this.selectionAutoplay = ready;
            if (PlaybackService.this.current == null) return Futures.immediateVoidFuture();
            if (ready) {
                if (PlaybackService.this.resolvingYouTube && PlaybackService.this.current.youtube() && (PlaybackService.this.player.getPlayerError() != null || PlaybackService.this.player.getPlaybackState() == STATE_IDLE)) return Futures.immediateVoidFuture();
                if (PlaybackService.this.current.youtube() && !PlaybackService.this.resolvingYouTube && (PlaybackService.this.player.getPlayerError() != null || PlaybackService.this.player.getPlaybackState() == STATE_IDLE)) {
                    PlaybackService.this.openYouTube(PlaybackService.this.current.uri.toString(), true, Math.max(0, PlaybackService.this.player.getCurrentPosition()));
                    return Futures.immediateVoidFuture();
                }
                PlaybackService.this.error = null;
                if (PlaybackService.this.player.getPlaybackState() == STATE_ENDED) PlaybackService.this.player.seekTo(0);
                if (PlaybackService.this.player.getPlaybackState() == STATE_IDLE) PlaybackService.this.player.prepare();
            }
            return super.handleSetPlayWhenReady(ready);
        }

        @Override protected ListenableFuture<?> handlePrepare() {
            if (PlaybackService.this.resuming != null) return Futures.immediateVoidFuture();
            if (PlaybackService.this.current != null && PlaybackService.this.current.youtube() && (PlaybackService.this.player.getPlayerError() != null || PlaybackService.this.player.getPlaybackState() == STATE_IDLE)) {
                if (!PlaybackService.this.resolvingYouTube) PlaybackService.this.openYouTube(PlaybackService.this.current.uri.toString(), PlaybackService.this.player.getPlayWhenReady(), Math.max(0, PlaybackService.this.player.getCurrentPosition()));
                return Futures.immediateVoidFuture();
            }
            return super.handlePrepare();
        }

        @Override protected ListenableFuture<?> handleStop() {
            PlaybackService.this.saveProgress(true);
            PlaybackService.this.selectionAutoplay = false;
            ++PlaybackService.this.selectionVersion;
            PlaybackService.this.cancelYouTube();
            PlaybackService.this.cancelFileRead();
            PlaybackService.this.openingFile = false;
            PlaybackService.this.player.pause();
            ListenableFuture<?> stopped = super.handleStop();
            PlaybackService.this.dismissResumption(true);
            return stopped;
        }
        void refresh() { this.invalidateState(); }
    }

    private void updateButtons() {
        this.controls.refresh();
        this.session.setMediaButtonPreferences(ImmutableList.of(
            new CommandButton.Builder(this.seekIcon(true, this.backward)).setPlayerCommand(Player.COMMAND_SEEK_BACK).setSlots(CommandButton.SLOT_BACK).setDisplayName(this.getString(R.string.shravanam_seek_back, this.backward)).build(),
            new CommandButton.Builder(this.seekIcon(false, this.forward)).setPlayerCommand(Player.COMMAND_SEEK_FORWARD).setSlots(CommandButton.SLOT_FORWARD).setDisplayName(this.getString(R.string.shravanam_seek_forward, this.forward)).build()));
    }

    private int seekIcon(boolean back, int seconds) {
        switch (seconds) {
            case 5: return back ? CommandButton.ICON_SKIP_BACK_5 : CommandButton.ICON_SKIP_FORWARD_5;
            case 10: return back ? CommandButton.ICON_SKIP_BACK_10 : CommandButton.ICON_SKIP_FORWARD_10;
            case 15: return back ? CommandButton.ICON_SKIP_BACK_15 : CommandButton.ICON_SKIP_FORWARD_15;
            case 30: return back ? CommandButton.ICON_SKIP_BACK_30 : CommandButton.ICON_SKIP_FORWARD_30;
            default: return back ? CommandButton.ICON_SKIP_BACK : CommandButton.ICON_SKIP_FORWARD;
        }
    }

    private MediaMetadata metadata(MediaFile file) {
        String source = this.getString(file.youtube() ? R.string.shravanam_source_youtube : R.string.shravanam_source_local);
        return new MediaMetadata.Builder().setTitle(file.name).setDisplayTitle(file.name).setSubtitle(source).setArtist(source).setIsPlayable(true).build();
    }

    private boolean pendingWithoutAudio() {
        return (this.openingFile || this.resolvingYouTube) && (this.current == null || this.player.getPlaybackState() == Player.STATE_IDLE || this.player.getPlayerError() != null);
    }

    boolean paused() {
        if (this.resuming != null) return (!this.openingFile && !this.resolvingYouTube) || !this.selectionAutoplay;
        if (this.pendingWithoutAudio()) return !this.selectionAutoplay;
        return !this.player.getPlayWhenReady() || this.player.getPlaybackState() == Player.STATE_ENDED || this.player.getPlayerError() != null;
    }

    private void seekBy(long milliseconds) { this.seekTo(this.player.getCurrentPosition() + milliseconds); }

    private void seekTo(long milliseconds) {
        if (this.current == null) return;
        long duration = this.player.getDuration();
        this.player.seekTo(Math.max(0, duration > 0 ? Math.min(milliseconds, duration) : milliseconds));
        this.saveProgress();
    }

    private static JSObject failure(String code, String name) {
        JSObject result = new JSObject().put("code", code);
        if (name != null) result.put("name", name);
        return result;
    }

    Player sessionPlayer() { return this.controls; }
    MediaFile currentMedia() { return this.current; }
    boolean openingMedia() { return this.openingFile || this.resolvingYouTube; }
    boolean failed() { return this.error != null; }
    boolean wantsVideo() { return this.videoRequested; }
    long videoRevision() { return this.videoRevision; }
    long claimVideo() { this.videoOwner = ++this.videoOwners; return this.videoOwner; }

    private void requestVideo(boolean value) {
        this.videoRequested = value;
        ++this.videoRevision;
        this.videoOwner = 0;
        this.videoLoading = false;
        this.videoError = null;
    }

    void videoStatus(long owner, long revision, boolean loading, boolean failed) {
        if (owner != this.videoOwner || revision != this.videoRevision) return;
        this.videoLoading = loading;
        this.videoError = failed ? PlaybackService.failure("video", this.current == null ? null : this.current.name) : null;
    }

    void releaseVideo(long owner, long revision, boolean closed) {
        if (owner != this.videoOwner || revision != this.videoRevision) return;
        this.videoOwner = 0;
        this.videoLoading = false;
        this.videoError = null;
        if (closed) this.videoRequested = false;
    }

    void openUris(List<Uri> uris, Runnable finished) {
        this.dismissResumption(false);
        this.cancelYouTube();
        this.cancelFileRead();
        CancellationSignal read = new CancellationSignal();
        this.pendingRead = read;
        long version = ++this.selectionVersion;
        this.openingFile = true;
        this.selectionAutoplay = true;
        this.controls.refresh();
        this.fileWorker.execute(() -> {
            ArrayList<MediaFile> accepted = new ArrayList<>();
            JSObject firstError = null;
            for (Uri uri : uris) {
                if (read.isCanceled()) break;
                try { accepted.add(MediaFile.read(this.getContentResolver(), uri, this.types, read)); }
                catch (Exception failure) {
                    Log.e("Shravanam", "Cannot open Android media", failure);
                    if (firstError == null) firstError = PlaybackService.failure(failure instanceof SecurityException ? "access" : failure instanceof MediaFile.UnsupportedFormat ? "format" : "open", failure instanceof MediaFile.UnsupportedFormat ? failure.getMessage() : null);
                }
            }
            JSObject importError = firstError;
            this.handler.post(() -> {
                if (this.destroyed) return;
                try {
                    if (version != this.selectionVersion) return;
                    if (this.pendingRead == read) this.pendingRead = null;
                    this.openingFile = false;
                    for (MediaFile file : accepted) this.files.put(file.id, file);
                    if (!accepted.isEmpty()) { this.remember(accepted); this.select(accepted.get(0).id, this.selectionAutoplay); }
                    if (importError != null) this.error = importError;
                    if (accepted.isEmpty()) this.failResumption("open", null);
                    this.controls.refresh();
                } catch (RuntimeException failure) {
                    Log.e("Shravanam", "Cannot start selected media", failure);
                    this.error = PlaybackService.failure("play", this.current == null ? null : this.current.name);
                } finally { finished.run(); }
            });
        });
    }

    private void remember(List<MediaFile> entries) {
        boolean youtube = entries.get(0).youtube();
        ArrayList<MediaFile> recents = youtube ? this.recentLinks : this.recent;
        ArrayList<MediaFile> ordered = new ArrayList<>();
        ArrayList<MediaFile> candidates = new ArrayList<>(entries);
        candidates.addAll(recents);
        for (MediaFile file : candidates) {
            boolean duplicate = false;
            for (MediaFile existing : ordered) if (existing.uri.equals(file.uri)) duplicate = true;
            if (!duplicate) ordered.add(file);
            if (ordered.size() == 20) break;
        }
        recents.clear();
        recents.addAll(ordered);
        JSONArray saved = new JSONArray();
        for (MediaFile file : recents) saved.put(file.stored());
        this.settings.edit().putString(youtube ? "recent-youtube" : "recent", saved.toString()).apply();
    }

    private void openRecent(String id, boolean automatic) {
        MediaFile selected = null;
        for (MediaFile file : this.recent) if (file.id.equals(id)) { selected = file; break; }
        for (MediaFile file : this.recentLinks) if (file.id.equals(id)) { selected = file; break; }
        if (selected == null) { MediaFile saved = SavedPlayback.last(this.settings); if (saved != null && saved.id.equals(id)) selected = saved; }
        if (selected == null) return;
        if (selected.youtube()) { this.openYouTube(selected.uri.toString(), !automatic, null); return; }
        this.cancelYouTube();
        this.cancelFileRead();
        CancellationSignal read = new CancellationSignal();
        this.pendingRead = read;
        MediaFile saved = selected;
        long version = ++this.selectionVersion;
        this.openingFile = true;
        this.selectionAutoplay = !automatic;
        this.controls.refresh();
        this.fileWorker.execute(() -> {
            MediaFile opened = null;
            JSObject failure = null;
            try {
                opened = MediaFile.read(this.getContentResolver(), saved.uri, this.types, read);
                if (!opened.id.equals(saved.id)) { opened = null; failure = PlaybackService.failure("changed-file", saved.name); }
            } catch (Exception error) {
                Log.e("Shravanam", "Cannot reopen recent Android file", error);
                failure = PlaybackService.failure(error instanceof SecurityException ? "access" : "open", saved.name);
            }
            MediaFile file = opened;
            JSObject openError = failure;
            this.handler.post(() -> {
                if (this.destroyed || version != this.selectionVersion) return;
                if (this.pendingRead == read) this.pendingRead = null;
                this.openingFile = false;
                if (file == null) { this.error = openError; this.controls.refresh(); this.failResumption(openError.getString("code", "open"), saved.name); return; }
                try { this.files.put(file.id, file); this.select(file.id, this.selectionAutoplay); }
                catch (RuntimeException error) { Log.e("Shravanam", "Cannot restore Android playback", error); this.error = PlaybackService.failure("play", file.name); this.failResumption("play", file.name); }
            });
        });
    }

    private void select(String id, boolean autoplay) {
        MediaFile file = this.files.get(id);
        if (file == null) return;
        if (file.youtube()) { this.openYouTube(file.uri.toString(), autoplay, null); return; }
        if (!file.kind.equals("video") && this.videoRequested) this.requestVideo(false);
        this.cancelYouTube();
        this.cancelFileRead();
        this.saveProgress();
        this.error = null;
        long position = Math.max(0, this.settings.getLong("position." + id, 0));
        MediaItem item = new MediaItem.Builder().setMediaId(id).setUri(file.uri).setMediaMetadata(this.metadata(file)).build();
        this.changingMedia = true;
        try {
            this.player.pause();
            this.current = file;
            this.player.setMediaItem(item, position);
            this.settings.edit().putString("last-media", file.id).apply();
            this.player.prepare();
            if (autoplay) this.player.play();
        } finally { this.changingMedia = false; }
        this.acceptedResumption(file);
        this.remember(java.util.Collections.singletonList(file));
    }

    private void cancelYouTube() {
        if (this.youtubeTask != null) this.youtubeTask.cancel(true);
        this.youtubeTask = null;
        if (this.youtubeTimeout != null) this.handler.removeCallbacks(this.youtubeTimeout);
        this.youtubeTimeout = null;
        this.resolvingYouTube = false;
        if (this.controls != null) this.controls.refresh();
    }

    private void openYouTube(String input, boolean autoplay, Long resume) {
        YouTubeSource source;
        try { source = YouTubeSource.parse(input); }
        catch (IllegalArgumentException failure) { this.error = PlaybackService.failure("youtube-link", input == null ? "" : input.substring(0, Math.min(200, input.length()))); return; }
        this.cancelYouTube();
        this.cancelFileRead();
        long version = ++this.selectionVersion;
        this.openingFile = false;
        this.resolvingYouTube = true;
        this.selectionAutoplay = autoplay;
        this.error = null;
        this.controls.refresh();
        long position = resume != null ? resume : source.start != null ? source.start : Math.max(0, this.settings.getLong("position." + source.id, 0));
        boolean followCurrentClock = resume == null && source.start == null && this.current != null && source.id.equals(this.current.id) && this.player.getPlayerError() == null;
        String processId = "shravanam-youtube-" + youtubeJobs.incrementAndGet();
        this.youtubeTask = this.youtubeWorker.submit(() -> {
            try {
                YouTubeResolver.Stream stream = YouTubeResolver.resolve(this, source, processId);
                this.handler.post(() -> {
                    if (this.destroyed || version != this.selectionVersion) return;
                    boolean play = this.selectionAutoplay;
                    this.cancelYouTube();
                    MediaFile file = MediaFile.youtube(source, stream.title);
                    try {
                        this.saveProgress();
                        this.changingMedia = true;
                        this.player.pause();
                        this.current = file;
                        this.files.put(file.id, file);
                        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory().setDefaultRequestProperties(stream.headers);
                        DefaultMediaSourceFactory factory = new DefaultMediaSourceFactory(this).setDataSourceFactory(new DefaultDataSource.Factory(this, http));
                        MediaItem item = new MediaItem.Builder().setMediaId(file.id).setUri(stream.url).setMediaMetadata(this.metadata(file)).build();
                        this.player.setMediaSource(factory.createMediaSource(item), followCurrentClock ? Math.max(0, this.player.getCurrentPosition()) : position);
                        this.player.prepare();
                        this.settings.edit().putString("last-media", file.id).apply();
                        this.remember(java.util.Collections.singletonList(file));
                        if (play) this.player.play();
                        this.acceptedResumption(file);
                    } catch (RuntimeException failure) { this.error = PlaybackService.failure("youtube", source.url); this.failResumption("youtube", source.url); }
                    finally { this.changingMedia = false; this.finishResumeNotification(); }
                });
            } catch (Exception failure) {
                this.handler.post(() -> {
                    if (this.destroyed || version != this.selectionVersion) return;
                    this.cancelYouTube();
                    Log.e("Shravanam", "Cannot resolve YouTube audio");
                    this.error = PlaybackService.failure(failure instanceof YouTubeResolver.UnsupportedLive ? "youtube-live" : "youtube", source.url);
                    this.failResumption(failure instanceof YouTubeResolver.UnsupportedLive ? "youtube-live" : "youtube", source.url);
                });
            }
        });
        this.youtubeTimeout = () -> {
            if (this.destroyed || version != this.selectionVersion || !this.resolvingYouTube) return;
            ++this.selectionVersion;
            this.cancelYouTube();
            this.error = PlaybackService.failure("youtube", source.url);
            this.failResumption("youtube", source.url);
        };
        this.handler.postDelayed(this.youtubeTimeout, 60000);
    }

    void command(JSObject command) {
        if (command == null) throw new IllegalArgumentException("Missing playback command");
        String type = command.getString("type", "");
        switch (type) {
            case "open-youtube":
                String url = command.getString("url", "");
                try { YouTubeSource.parse(url); }
                catch (IllegalArgumentException failure) { this.error = PlaybackService.failure("youtube-link", url.substring(0, Math.min(200, url.length()))); break; }
                this.dismissResumption(false);
                if (command.has("audioOnly")) {
                    if (!(command.opt("audioOnly") instanceof Boolean)) throw new IllegalArgumentException("Invalid playback mode");
                    this.requestVideo(!command.getBool("audioOnly", true));
                }
                this.openYouTube(url, true, null);
                break;
            case "audio-only":
                if (!(command.opt("value") instanceof Boolean)) throw new IllegalArgumentException("Invalid playback mode");
                boolean audioOnly = command.getBool("value", true);
                if (!audioOnly && this.current != null && !this.current.kind.equals("video")) { this.videoError = PlaybackService.failure("video", this.current.name); break; }
                this.requestVideo(!audioOnly);
                break;
            case "select":
                String id = command.getString("id", "");
                if (!this.files.containsKey(id)) break;
                this.dismissResumption(false);
                ++this.selectionVersion;
                this.openingFile = false;
                this.select(id, true);
                break;
            case "recent":
                String recentId = command.getString("id", "");
                if (this.recent.stream().noneMatch(file -> file.id.equals(recentId)) && this.recentLinks.stream().noneMatch(file -> file.id.equals(recentId))) break;
                this.dismissResumption(false);
                this.openRecent(recentId, false);
                break;
            case "toggle":
                if (!this.paused()) this.controls.pause();
                else this.controls.play();
                break;
            case "seek": this.seekTo((long) (PlaybackService.number(command, "time", 0, Long.MAX_VALUE / 1000.0) * 1000)); break;
            case "speed": this.player.setPlaybackSpeed((float) PlaybackService.number(command, "value", 0.25, 3)); break;
            case "intervals":
                double back = PlaybackService.number(command, "backward", 1, 600);
                double next = PlaybackService.number(command, "forward", 1, 600);
                if (back != Math.rint(back) || next != Math.rint(next)) throw new IllegalArgumentException("Seek intervals must be whole seconds");
                this.backward = (int) back;
                this.forward = (int) next;
                this.updateButtons();
                break;
            default: throw new IllegalArgumentException("Unknown playback command");
        }
        this.saveProgress();
    }

    private static double number(JSObject command, String key, double minimum, double maximum) {
        Object value = command.opt(key);
        if (!(value instanceof Number)) throw new IllegalArgumentException("Missing numeric playback value");
        double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || number < minimum || number > maximum) throw new IllegalArgumentException("Playback value is out of range");
        return number;
    }

    JSObject snapshot() {
        JSArray items = new JSArray();
        for (MediaFile file : this.files.values()) items.put(file.snapshot());
        JSArray recent = new JSArray();
        for (MediaFile file : this.recent) recent.put(file.snapshot());
        JSArray recentLinks = new JSArray();
        for (MediaFile file : this.recentLinks) recentLinks.put(file.snapshot());
        long duration = this.player.getDuration();
        return new JSObject().put("items", items).put("recent", recent).put("recentLinks", recentLinks).put("youtubeSupported", true).put("currentId", this.resuming != null ? this.resuming.id : this.current == null ? JSONObject.NULL : this.current.id)
            .put("videoSupported", true).put("sourceBrowserSupported", true).put("audioOnly", !this.videoRequested)
            .put("videoLoading", this.videoLoading).put("videoError", this.videoError == null ? JSONObject.NULL : this.videoError)
            .put("time", (this.resuming != null ? this.resumePosition : Math.max(0, this.player.getCurrentPosition())) / 1000.0).put("duration", this.resuming == null && duration > 0 ? duration / 1000.0 : 0)
            .put("paused", this.paused())
            .put("loading", this.openingFile || this.resolvingYouTube || this.player.getPlaybackState() == Player.STATE_BUFFERING).put("speed", this.player.getPlaybackParameters().speed)
            .put("backward", this.backward).put("forward", this.forward).put("error", this.error == null ? JSONObject.NULL : this.error);
    }

    void saveProgress() { this.saveProgress(false); }

    private void saveProgress(boolean flush) {
        SharedPreferences.Editor edit = this.settings.edit().putFloat("speed", this.player.getPlaybackParameters().speed).putInt("backward", this.backward).putInt("forward", this.forward);
        if (!this.changingMedia && this.current != null && this.player.getPlaybackState() != Player.STATE_IDLE && this.player.getPlayerError() == null) {
            long position = this.player.getPlaybackState() == Player.STATE_ENDED ? 0 : Math.max(0, this.player.getCurrentPosition());
            edit.putLong("position." + this.current.id, position);
        }
        if (flush) { if (!edit.commit()) this.error = PlaybackService.failure("storage", null); }
        else edit.apply();
    }

    @Override
    public void onDestroy() {
        this.destroyed = true;
        ++this.selectionVersion;
        this.cancelYouTube();
        this.cancelFileRead();
        PlaybackService.instance = null;
        this.saveProgress(true);
        if (this.resumeForeground) this.stopForeground(STOP_FOREGROUND_REMOVE);
        this.handler.removeCallbacksAndMessages(null);
        this.fileWorker.shutdownNow();
        this.youtubeWorker.shutdownNow();
        this.unregisterReceiver(this.noisy);
        this.controls.release();
        this.session.release();
        super.onDestroy();
    }
}

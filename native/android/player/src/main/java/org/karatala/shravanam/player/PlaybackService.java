package org.karatala.shravanam.player;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.OptIn;
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
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
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
    private boolean youtubeAutoplay;
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
        MediaSession.Builder builder = new MediaSession.Builder(this, this.controls).setCallback(new MediaSession.Callback() {
            @Override public MediaSession.ConnectionResult onConnect(MediaSession session, MediaSession.ControllerInfo controller) {
                if (!controller.isTrusted()) return MediaSession.ConnectionResult.reject();
                Player.Commands allowed = new Player.Commands.Builder().addAll(
                    Player.COMMAND_PLAY_PAUSE, Player.COMMAND_PREPARE, Player.COMMAND_STOP,
                    Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD,
                    Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                    Player.COMMAND_GET_CURRENT_MEDIA_ITEM, Player.COMMAND_GET_TIMELINE, Player.COMMAND_GET_METADATA, Player.COMMAND_GET_AUDIO_ATTRIBUTES, Player.COMMAND_GET_TRACKS).build();
                return MediaSession.ConnectionResult.accept(SessionCommands.EMPTY, allowed);
            }
        });
        Intent launch = this.getPackageManager().getLaunchIntentForPackage(this.getPackageName());
        if (launch != null) builder.setSessionActivity(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        this.session = builder.build();
        this.updateButtons();
        this.player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException failure) {
                if (PlaybackService.this.current != null && PlaybackService.this.current.youtube()) Log.e("Shravanam", "YouTube playback failed: " + failure.errorCode);
                else Log.e("Shravanam", "Android playback failed", failure);
                PlaybackService.this.error = PlaybackService.failure(failure.errorCode == PlaybackException.ERROR_CODE_IO_NO_PERMISSION ? "access" : "play", PlaybackService.this.current == null ? null : PlaybackService.this.current.name);
                if (PlaybackService.this.current != null && PlaybackService.this.current.youtube()) PlaybackService.this.settings.edit().putLong("position." + PlaybackService.this.current.id, Math.max(0, PlaybackService.this.player.getCurrentPosition())).apply();
            }
            @Override public void onEvents(Player player, Player.Events events) {
                if (events.containsAny(Player.EVENT_POSITION_DISCONTINUITY, Player.EVENT_PLAY_WHEN_READY_CHANGED, Player.EVENT_PLAYBACK_STATE_CHANGED, Player.EVENT_PLAYBACK_PARAMETERS_CHANGED)) PlaybackService.this.saveProgress();
            }
        });
        PlaybackService.instance = this;
        this.handler.postDelayed(this.checkpoint, 5000);
        String lastId = this.settings.getString("last-media", "");
        MediaFile last = null;
        for (MediaFile file : this.recent) if (file.id.equals(lastId)) last = file;
        for (MediaFile file : this.recentLinks) if (file.id.equals(lastId)) last = file;
        if (last != null) this.openRecent(last.id, true);
        else if (!this.recent.isEmpty()) this.openRecent(this.recent.get(0).id, true);
        else if (!this.recentLinks.isEmpty()) this.openRecent(this.recentLinks.get(0).id, true);
    }

    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controller) { return this.session; }

    // SimpleBasePlayer keeps command and interval change events consistent with its getters.
    private final class SessionPlayer extends ForwardingSimpleBasePlayer {
        SessionPlayer() { super(PlaybackService.this.player); }

        @Override protected State getState() {
            State state = super.getState();
            Commands.Builder commands = state.availableCommands.buildUpon();
            if (state.availableCommands.contains(COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)) commands.addAll(COMMAND_SEEK_TO_PREVIOUS, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, COMMAND_SEEK_TO_NEXT, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM);
            return state.buildUpon().setAvailableCommands(commands.build()).setSeekBackIncrementMs(PlaybackService.this.backward * 1000L).setSeekForwardIncrementMs(PlaybackService.this.forward * 1000L).build();
        }

        @Override protected ListenableFuture<?> handleSeek(int mediaItemIndex, long positionMs, int seekCommand) {
            if (seekCommand == COMMAND_SEEK_BACK || seekCommand == COMMAND_SEEK_TO_PREVIOUS || seekCommand == COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) PlaybackService.this.seekBy(-PlaybackService.this.backward * 1000L);
            else if (seekCommand == COMMAND_SEEK_FORWARD || seekCommand == COMMAND_SEEK_TO_NEXT || seekCommand == COMMAND_SEEK_TO_NEXT_MEDIA_ITEM) PlaybackService.this.seekBy(PlaybackService.this.forward * 1000L);
            else return super.handleSeek(mediaItemIndex, positionMs, seekCommand);
            return Futures.immediateVoidFuture();
        }

        @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean ready) {
            if (PlaybackService.this.resolvingYouTube) PlaybackService.this.youtubeAutoplay = ready;
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
            if (PlaybackService.this.current != null && PlaybackService.this.current.youtube() && (PlaybackService.this.player.getPlayerError() != null || PlaybackService.this.player.getPlaybackState() == STATE_IDLE)) {
                if (!PlaybackService.this.resolvingYouTube) PlaybackService.this.openYouTube(PlaybackService.this.current.uri.toString(), PlaybackService.this.player.getPlayWhenReady(), Math.max(0, PlaybackService.this.player.getCurrentPosition()));
                return Futures.immediateVoidFuture();
            }
            return super.handlePrepare();
        }

        @Override protected ListenableFuture<?> handleStop() {
            PlaybackService.this.saveProgress();
            ++PlaybackService.this.selectionVersion;
            PlaybackService.this.cancelYouTube();
            PlaybackService.this.openingFile = false;
            return super.handleStop();
        }
        void refresh() { this.invalidateState(); }
    }

    private void updateButtons() {
        this.controls.refresh();
        this.session.setMediaButtonPreferences(ImmutableList.of(
            new CommandButton.Builder(CommandButton.ICON_SKIP_BACK).setPlayerCommand(Player.COMMAND_SEEK_BACK).setDisplayName(this.getString(R.string.shravanam_seek_back, this.backward)).build(),
            new CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD).setPlayerCommand(Player.COMMAND_SEEK_FORWARD).setDisplayName(this.getString(R.string.shravanam_seek_forward, this.forward)).build()));
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
        this.cancelYouTube();
        long version = ++this.selectionVersion;
        this.openingFile = true;
        this.fileWorker.execute(() -> {
            ArrayList<MediaFile> accepted = new ArrayList<>();
            JSObject firstError = null;
            for (Uri uri : uris) {
                try { accepted.add(MediaFile.read(this.getContentResolver(), uri, this.types)); }
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
                    this.openingFile = false;
                    for (MediaFile file : accepted) this.files.put(file.id, file);
                    if (!accepted.isEmpty()) { this.remember(accepted); this.select(accepted.get(0).id, true); }
                    if (importError != null) this.error = importError;
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
        if (selected == null) return;
        if (selected.youtube()) { this.openYouTube(selected.uri.toString(), !automatic, null); return; }
        this.cancelYouTube();
        MediaFile saved = selected;
        long version = ++this.selectionVersion;
        this.openingFile = true;
        this.fileWorker.execute(() -> {
            MediaFile opened = null;
            JSObject failure = null;
            try {
                opened = MediaFile.read(this.getContentResolver(), saved.uri, this.types);
                if (!opened.id.equals(saved.id)) { opened = null; failure = PlaybackService.failure("changed-file", saved.name); }
            } catch (Exception error) {
                Log.e("Shravanam", "Cannot reopen recent Android file", error);
                failure = PlaybackService.failure(error instanceof SecurityException ? "access" : "open", saved.name);
            }
            MediaFile file = opened;
            JSObject openError = failure;
            this.handler.post(() -> {
                if (this.destroyed || version != this.selectionVersion) return;
                this.openingFile = false;
                if (file == null) { this.error = openError; return; }
                try { this.files.put(file.id, file); this.select(file.id, !automatic); }
                catch (RuntimeException error) { Log.e("Shravanam", "Cannot restore Android playback", error); this.error = PlaybackService.failure("play", file.name); }
            });
        });
    }

    private void select(String id, boolean autoplay) {
        MediaFile file = this.files.get(id);
        if (file == null) return;
        if (file.youtube()) { this.openYouTube(file.uri.toString(), autoplay, null); return; }
        if (!file.kind.equals("video") && this.videoRequested) this.requestVideo(false);
        this.cancelYouTube();
        this.saveProgress();
        this.error = null;
        long position = Math.max(0, this.settings.getLong("position." + id, 0));
        MediaItem item = new MediaItem.Builder().setMediaId(id).setUri(file.uri).setMediaMetadata(new MediaMetadata.Builder().setTitle(file.name).build()).build();
        this.changingMedia = true;
        try {
            this.player.pause();
            this.current = file;
            this.player.setMediaItem(item, position);
            this.settings.edit().putString("last-media", file.id).apply();
            this.player.prepare();
            if (autoplay) this.player.play();
        } finally { this.changingMedia = false; }
        this.remember(java.util.Collections.singletonList(file));
    }

    private void cancelYouTube() {
        if (this.youtubeTask != null) this.youtubeTask.cancel(true);
        this.youtubeTask = null;
        if (this.youtubeTimeout != null) this.handler.removeCallbacks(this.youtubeTimeout);
        this.youtubeTimeout = null;
        this.resolvingYouTube = false;
    }

    private void openYouTube(String input, boolean autoplay, Long resume) {
        YouTubeSource source;
        try { source = YouTubeSource.parse(input); }
        catch (IllegalArgumentException failure) { this.error = PlaybackService.failure("youtube-link", input == null ? "" : input.substring(0, Math.min(200, input.length()))); return; }
        this.cancelYouTube();
        long version = ++this.selectionVersion;
        this.openingFile = false;
        this.resolvingYouTube = true;
        this.youtubeAutoplay = autoplay;
        this.error = null;
        long position = resume != null ? resume : source.start != null ? source.start : Math.max(0, this.settings.getLong("position." + source.id, 0));
        boolean followCurrentClock = resume == null && source.start == null && this.current != null && source.id.equals(this.current.id) && this.player.getPlayerError() == null;
        String processId = "shravanam-youtube-" + youtubeJobs.incrementAndGet();
        this.youtubeTask = this.youtubeWorker.submit(() -> {
            try {
                YouTubeResolver.Stream stream = YouTubeResolver.resolve(this, source, processId);
                this.handler.post(() -> {
                    if (this.destroyed || version != this.selectionVersion) return;
                    boolean play = this.youtubeAutoplay;
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
                        MediaItem item = new MediaItem.Builder().setMediaId(file.id).setUri(stream.url).setMediaMetadata(new MediaMetadata.Builder().setTitle(file.name).build()).build();
                        this.player.setMediaSource(factory.createMediaSource(item), followCurrentClock ? Math.max(0, this.player.getCurrentPosition()) : position);
                        this.player.prepare();
                        this.settings.edit().putString("last-media", file.id).apply();
                        this.remember(java.util.Collections.singletonList(file));
                        if (play) this.player.play();
                    } catch (RuntimeException failure) { this.error = PlaybackService.failure("youtube", source.url); }
                    finally { this.changingMedia = false; }
                });
            } catch (Exception failure) {
                this.handler.post(() -> {
                    if (this.destroyed || version != this.selectionVersion) return;
                    this.cancelYouTube();
                    Log.e("Shravanam", "Cannot resolve YouTube audio");
                    this.error = PlaybackService.failure(failure instanceof YouTubeResolver.UnsupportedLive ? "youtube-live" : "youtube", source.url);
                });
            }
        });
        this.youtubeTimeout = () -> {
            if (this.destroyed || version != this.selectionVersion || !this.resolvingYouTube) return;
            ++this.selectionVersion;
            this.cancelYouTube();
            this.error = PlaybackService.failure("youtube", source.url);
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
                ++this.selectionVersion;
                this.openingFile = false;
                this.select(id, true);
                break;
            case "recent": this.openRecent(command.getString("id", ""), false); break;
            case "toggle":
                if (this.player.getPlayWhenReady() && this.player.getPlaybackState() != Player.STATE_ENDED && this.player.getPlayerError() == null) this.controls.pause();
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
        return new JSObject().put("items", items).put("recent", recent).put("recentLinks", recentLinks).put("youtubeSupported", true).put("currentId", this.current == null ? JSONObject.NULL : this.current.id)
            .put("videoSupported", true).put("sourceBrowserSupported", true).put("audioOnly", !this.videoRequested)
            .put("videoLoading", this.videoLoading).put("videoError", this.videoError == null ? JSONObject.NULL : this.videoError)
            .put("time", Math.max(0, this.player.getCurrentPosition()) / 1000.0).put("duration", duration > 0 ? duration / 1000.0 : 0)
            .put("paused", !this.player.getPlayWhenReady() || this.player.getPlaybackState() == Player.STATE_ENDED || this.player.getPlayerError() != null)
            .put("loading", this.openingFile || this.resolvingYouTube || this.player.getPlaybackState() == Player.STATE_BUFFERING).put("speed", this.player.getPlaybackParameters().speed)
            .put("backward", this.backward).put("forward", this.forward).put("error", this.error == null ? JSONObject.NULL : this.error);
    }

    void saveProgress() {
        SharedPreferences.Editor edit = this.settings.edit().putFloat("speed", this.player.getPlaybackParameters().speed).putInt("backward", this.backward).putInt("forward", this.forward);
        if (!this.changingMedia && this.current != null && this.player.getPlaybackState() != Player.STATE_IDLE && this.player.getPlayerError() == null) {
            long position = this.player.getPlaybackState() == Player.STATE_ENDED ? 0 : Math.max(0, this.player.getCurrentPosition());
            edit.putLong("position." + this.current.id, position);
        }
        edit.apply();
    }

    @Override
    public void onDestroy() {
        this.destroyed = true;
        ++this.selectionVersion;
        this.cancelYouTube();
        PlaybackService.instance = null;
        this.saveProgress();
        this.handler.removeCallbacksAndMessages(null);
        this.fileWorker.shutdownNow();
        this.youtubeWorker.shutdownNow();
        this.controls.release();
        this.session.release();
        super.onDestroy();
    }
}

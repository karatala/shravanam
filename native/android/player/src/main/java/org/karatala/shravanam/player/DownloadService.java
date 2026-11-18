package org.karatala.shravanam.player;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.source.TrackGroupArray;
import androidx.media3.inspector.MetadataRetriever;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import com.yausername.youtubedl_android.YoutubeDLException;
import java.io.File;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.TimeUnit;
import kotlin.Unit;

// Manual foreground transfers only. Playback has its own service, player, and notification.
@OptIn(markerClass = UnstableApi.class)
public final class DownloadService extends Service {
    private static final String CANCEL = "org.karatala.shravanam.CANCEL_DOWNLOAD";
    private static final String CHANNEL = "shravanam.downloads";
    private static final int NOTIFICATION = 2002;
    private static final AtomicLong processes = new AtomicLong();
    private static DownloadService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean cancelled;
    private volatile boolean stopping;
    private volatile boolean downloadStarted;
    private Thread task;
    private String jobId = "";
    private String processId = "";
    private OfflineDownloads store;
    private PowerManager.WakeLock wake;

    static final class StartFailure extends IllegalStateException { StartFailure(Exception failure) { super("Android could not start the transfer", failure); } }

    static void enqueue(Context context, String url, boolean audioOnly, int quality, String retryId) throws IOException {
        if (busy()) throw new IllegalStateException("A transfer is still stopping");
        OfflineDownloads store = OfflineDownloads.get(context);
        OfflineDownloads.Job job = store.start(url, audioOnly, quality, retryId);
        if (job.status.equals("ready")) return;
        try { start(context, job.id); }
        catch (Exception failure) { store.finish(job.id, "failed", "background", null); throw new StartFailure(failure); }
    }

    static void start(Context context, String id) {
        ContextCompat.startForegroundService(context, new Intent(context, DownloadService.class).putExtra("download-id", id));
    }

    static boolean busy() { return instance != null && instance.task != null; }

    static void cancel(Context context, String id) throws IOException {
        OfflineDownloads.get(context).requestCancel(id);
        if (instance != null && instance.jobId.equals(id)) instance.cancelTransfer(false);
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        PlaybackDiagnostics.initialize(this);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, this.getString(R.string.shravanam_download_channel), NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null);
            this.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && CANCEL.equals(intent.getAction())) {
            try { cancel(this, intent.getStringExtra("download-id")); }
            catch (IOException failure) { PlaybackDiagnostics.record("download.cancel.failed", "Cannot cancel transfer", failure); }
            if (this.task == null) this.stopSelf();
            return START_NOT_STICKY;
        }
        if (this.task != null) return START_NOT_STICKY;
        String id = intent == null ? "" : intent.getStringExtra("download-id");
        try {
            this.store = OfflineDownloads.get(this);
            if (id == null || !this.store.running(id)) { this.stopSelf(); return START_NOT_STICKY; }
            if (this.store.job(id).status.equals("cancelling")) { this.finishIndex(id, "cancelled", "", null); this.stopSelf(); return START_NOT_STICKY; }
            this.jobId = id;
            this.processId = "shravanam-download-" + processes.incrementAndGet();
            ServiceCompat.startForeground(this, NOTIFICATION, this.notification(), Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC : 0);
            PowerManager power = (PowerManager) this.getSystemService(Context.POWER_SERVICE);
            this.wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Shravanam:download");
            this.wake.acquire(6 * 60 * 60 * 1000L);
            this.task = new Thread(this::transfer, "shravanam-download");
            this.task.start();
            this.handler.post(this.refresh);
            this.handler.postDelayed(() -> { this.cancelTransfer(true); this.stopForeground(STOP_FOREGROUND_REMOVE); this.stopSelf(); }, 6 * 60 * 60 * 1000L);
        } catch (Exception failure) {
            PlaybackDiagnostics.record("download.start.failed", "Cannot start foreground transfer", failure);
            if (this.store != null && id != null) this.finishIndex(id, "failed", "background", null);
            this.stopForeground(STOP_FOREGROUND_REMOVE);
            this.stopSelf();
        }
        return START_NOT_STICKY;
    }

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (DownloadService.this.stopping || DownloadService.this.task == null) return;
            DownloadService.this.getSystemService(NotificationManager.class).notify(NOTIFICATION, DownloadService.this.notification());
            DownloadService.this.handler.postDelayed(this, 1000);
        }
    };

    private android.app.Notification notification() {
        OfflineDownloads.Job job = this.store == null ? null : this.store.job(this.jobId);
        Intent launch = this.getPackageManager().getLaunchIntentForPackage(this.getPackageName());
        PendingIntent open = launch == null ? null : PendingIntent.getActivity(this, NOTIFICATION, launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, DownloadService.class).setAction(CANCEL).putExtra("download-id", this.jobId);
        PendingIntent cancel = PendingIntent.getService(this, NOTIFICATION, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        boolean finishing = job != null && job.status.equals("finishing");
        String detail = this.cancelled ? this.getString(R.string.shravanam_download_cancelling) : finishing ? this.getString(R.string.shravanam_download_finishing)
            : job != null && job.part > 0 ? this.getString(R.string.shravanam_download_progress, job.part, job.percent) : this.getString(R.string.shravanam_download_starting);
        return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(job == null ? this.getString(R.string.shravanam_download_channel) : job.title)
            .setContentText(detail).setContentIntent(open).setOnlyAlertOnce(true).setSilent(true).setOngoing(true).setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(100, job == null ? 0 : job.percent, this.cancelled || finishing || job == null || job.total == 0)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, this.getString(android.R.string.cancel), cancel).build();
    }

    private void transfer() {
        File completed = null;
        try {
            OfflineDownloads.Job job = this.store.job(this.jobId);
            File directory = this.store.directory(this.jobId);
            YouTubeRuntime.initialize(this);
            FFmpeg.INSTANCE.init(this.getApplicationContext());
            this.checkCancelled();
            PlaybackDiagnostics.record("download.extract.start", this.processId + " audioOnly=" + job.audioOnly + " quality=" + job.quality);
            YoutubeDLResponse response;
            try { response = this.execute(this.request(job, directory, YouTubeRuntime.PRIMARY_CLIENT)); }
            catch (YoutubeDLException failure) {
                this.checkCancelled();
                if (this.downloadStarted) throw failure;
                PlaybackDiagnostics.record("download.client.fallback", this.processId + " visionOS extraction unavailable; trying web_embedded", failure);
                response = this.execute(this.request(job, directory, YouTubeRuntime.FALLBACK_CLIENT));
            }
            PlaybackDiagnostics.record("download.extract.done", this.processId + " exit=" + response.getExitCode() + "\n" + response.getErr());
            this.checkCancelled();
            for (String line : response.getOut().split("\\r?\\n")) {
                if (line.startsWith(DownloadProtocol.FILE)) {
                    completed = DownloadProtocol.ownedFile(directory, DownloadProtocol.string(line.substring(DownloadProtocol.FILE.length())));
                    DownloadProtocol.completedFile(directory, completed.getPath());
                }
            }
            if (completed == null) throw new IOException("No completed offline file was reported");
            this.store.finishing(this.jobId);
            try (MetadataRetriever metadata = new MetadataRetriever.Builder(this, MediaItem.fromUri(Uri.fromFile(completed))).build()) {
                TrackGroupArray tracks = metadata.retrieveTrackGroups().get(30, TimeUnit.SECONDS);
                boolean audio = false;
                boolean video = false;
                for (int idx = 0; idx < tracks.length; idx++) { audio |= tracks.get(idx).type == C.TRACK_TYPE_AUDIO; video |= tracks.get(idx).type == C.TRACK_TYPE_VIDEO; }
                if (!audio || (!job.audioOnly && !video)) throw new IOException("The completed file does not contain the requested media tracks");
            }
            this.checkCancelled();
            this.finishIndex(this.jobId, "ready", "", completed);
            if (this.store.job(this.jobId).status.equals("ready")) PlaybackDiagnostics.record("download.ready", this.processId + " bytes=" + completed.length());
        } catch (Exception | LinkageError failure) {
            PlaybackDiagnostics.record(this.cancelled || this.stopping ? "download.cancelled" : "download.failed", this.processId, failure);
            if (completed != null && !this.cancelled && !this.stopping) {
                try { this.store.quarantine(this.jobId, completed); }
                catch (IOException retained) { PlaybackDiagnostics.record("download.file.retain.failed", "Cannot move the failed output aside", retained); }
            }
            this.finishIndex(this.jobId, this.cancelled ? "cancelled" : this.stopping ? "interrupted" : "failed", this.cancelled || this.stopping ? "" : "download", null);
        } finally {
            this.handler.post(() -> { this.stopping = true; this.handler.removeCallbacks(this.refresh); this.stopForeground(STOP_FOREGROUND_REMOVE); this.stopSelf(); });
        }
    }

    private void output(String line) {
        try {
            if (line.startsWith(DownloadProtocol.TITLE)) { this.downloadStarted = true; this.store.title(this.jobId, DownloadProtocol.string(line.substring(DownloadProtocol.TITLE.length()))); }
            else if (line.startsWith(DownloadProtocol.PROGRESS)) { this.downloadStarted = true; this.store.progress(this.jobId, new DownloadProtocol.Progress(line.substring(DownloadProtocol.PROGRESS.length()))); }
            else if (line.startsWith(DownloadProtocol.FINISH)) this.store.finishing(this.jobId);
        } catch (Exception failure) { PlaybackDiagnostics.record("download.progress.invalid", "Ignored an invalid structured progress record", failure); }
    }

    private YoutubeDLRequest request(OfflineDownloads.Job job, File directory, String client) {
        YoutubeDLRequest request = new YoutubeDLRequest(job.source.url);
        YouTubeRuntime.configure(request, client);
        for (String option : new String[] { "--ignore-config", "--no-plugin-dirs", "--no-remote-components", "--no-cache-dir", "--no-playlist", "--no-check-formats", "--no-write-info-json", "--no-write-playlist-metafiles", "--no-write-thumbnail", "--no-write-subs", "--no-write-auto-subs", "--no-mtime", "--continue", "--part", "--newline", "--progress", "--no-simulate" }) request.addOption(option);
        request.addOption("--socket-timeout", "15").addOption("--retries", "2").addOption("--fragment-retries", "2").addOption("--extractor-retries", "1")
            .addOption("--match-filter", "!is_live & !is_upcoming").addOption("-f", DownloadProtocol.format(job.audioOnly, job.quality)).addOption("-o", new File(directory, "media.%(ext)s").getPath())
            .addOption("--print", "before_dl:" + DownloadProtocol.TITLE + "%(title)j").addOption("--print", "after_move:" + DownloadProtocol.FILE + "%(filepath)j")
            .addOption("--progress-template", "download:" + DownloadProtocol.PROGRESS + "%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.eta)s|%(progress.speed)s|%(info.format_id)s")
            .addOption("--progress-template", "postprocess:" + DownloadProtocol.FINISH + "%(progress.status)s").addOption("--progress-delta", "0.5");
        if (job.audioOnly) request.addOption("--extract-audio").addOption("--audio-format", "best");
        else request.addOption("--merge-output-format", "mkv").addOption("-S", "res:" + job.quality + ",vcodec:h264,acodec:aac");
        if (PlaybackDiagnostics.enabled(this)) request.addOption("--verbose");
        return request;
    }

    private YoutubeDLResponse execute(YoutubeDLRequest request) throws Exception {
        this.checkCancelled();
        return YoutubeDL.INSTANCE.execute(request, this.processId, false, (progress, eta, line) -> {
            if (!this.cancelled && !this.stopping) this.output(line);
            return Unit.INSTANCE;
        });
    }

    private void finishIndex(String id, String status, String error, File file) {
        try { this.store.finish(id, status, error, file); }
        catch (IOException failure) { PlaybackDiagnostics.record("download.index.failed", "Cannot save transfer state", failure); }
    }

    private void checkCancelled() throws InterruptedException { if (this.cancelled || this.stopping || Thread.currentThread().isInterrupted()) throw new InterruptedException("Transfer cancelled"); }

    private void cancelTransfer(boolean interrupted) {
        if (this.task == null || this.cancelled || this.stopping) return;
        this.cancelled = !interrupted;
        this.stopping = interrupted;
        Thread worker = this.task;
        String process = this.processId;
        new Thread(() -> {
            try { YoutubeDL.INSTANCE.destroyProcessById(process); }
            catch (Exception | LinkageError failure) { PlaybackDiagnostics.record("download.process.cancel.failed", "The worker will still be interrupted", failure); }
            finally { worker.interrupt(); }
        }, "shravanam-cancel-download").start();
    }

    @Override public void onTimeout(int startId, int foregroundServiceType) { this.cancelTransfer(true); this.stopForeground(STOP_FOREGROUND_REMOVE); this.stopSelf(); }

    @Override public void onDestroy() {
        this.cancelTransfer(true);
        this.stopping = true;
        this.handler.removeCallbacksAndMessages(null);
        if (this.wake != null && this.wake.isHeld()) this.wake.release();
        if (instance == this) instance = null;
        super.onDestroy();
    }
}

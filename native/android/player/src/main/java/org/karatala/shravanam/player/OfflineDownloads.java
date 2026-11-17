package org.karatala.shravanam.player;

import android.content.Context;
import android.util.AtomicFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

// One process owns the index. It contains canonical sources and relative names, never stream URLs.
final class OfflineDownloads {
    private static OfflineDownloads instance;
    private final File root;
    private final AtomicFile index;
    private final LinkedHashMap<String, Job> jobs = new LinkedHashMap<>();
    private String active = "";

    static final class Copy {
        final String id;
        final String sourceId;
        final String url;
        final String title;
        final File file;
        final boolean video;
        Copy(Job job, File file) { this.id = job.id; this.sourceId = job.source.id; this.url = job.source.url; this.title = job.title; this.file = file; this.video = !job.audioOnly; }
    }

    static final class Job {
        final String id;
        final YouTubeSource source;
        final boolean audioOnly;
        final int quality;
        String title;
        String status = "interrupted";
        String error = "";
        String filename = "";
        long bytes;
        long total;
        long eta;
        double speed;
        int percent;
        int part;
        String format = "";
        Job(YouTubeSource source, boolean audioOnly, int quality) {
            this.source = source;
            this.audioOnly = audioOnly;
            this.quality = audioOnly ? 0 : DownloadProtocol.quality(quality);
            this.id = source.videoId + (audioOnly ? "-audio" : "-video-" + this.quality);
            this.title = source.videoId;
        }
        JSObject snapshot() {
            return new JSObject().put("id", this.id).put("sourceId", this.source.id).put("url", this.source.url).put("title", this.title).put("audioOnly", this.audioOnly).put("quality", this.quality)
                .put("status", this.status).put("error", this.error).put("percent", this.percent).put("downloaded", this.bytes).put("total", this.total).put("speed", this.speed).put("eta", this.eta).put("part", this.part);
        }
    }

    static synchronized OfflineDownloads get(Context context) throws IOException {
        if (instance == null) instance = new OfflineDownloads(new File(context.getApplicationContext().getNoBackupFilesDir(), "youtube-downloads"));
        return instance;
    }

    OfflineDownloads(File root) throws IOException {
        this.root = root.getCanonicalFile();
        if (!this.root.isDirectory() && !this.root.mkdirs()) throw new IOException("Cannot create offline storage");
        this.index = new AtomicFile(new File(this.root, "index.json"));
        try {
            byte[] data = this.index.readFully();
            if (data.length > 2 * 1024 * 1024) throw new IOException("Download index is too large");
            JSONObject saved = new JSONObject(new String(data, StandardCharsets.UTF_8));
            if (saved.getInt("version") != 1) throw new IOException("Unsupported download index");
            JSONArray entries = saved.getJSONArray("items");
            for (int idx = 0; idx < entries.length(); idx++) {
                JSONObject value = entries.getJSONObject(idx);
                Job job = new Job(YouTubeSource.parse(value.getString("url")), value.getBoolean("audioOnly"), value.getInt("quality"));
                if (!job.id.equals(value.getString("id"))) throw new IOException("Invalid download identity");
                job.title = value.getString("title");
                job.filename = value.getString("filename");
                job.bytes = Math.max(0, value.optLong("bytes"));
                job.status = value.getString("status");
                if (!Arrays.asList("ready", "cancelled", "interrupted", "failed").contains(job.status)) job.status = "interrupted";
                job.error = value.optString("error", job.status.equals("failed") ? "download" : "");
                if (!Arrays.asList("", "download", "storage", "missing", "background").contains(job.error)) job.error = "download";
                if (job.title.length() > 300) throw new IOException("Invalid download title");
                this.jobs.put(job.id, job);
                if (job.status.equals("ready") && this.copy(job) == null) { job.status = "failed"; job.error = "missing"; }
            }
        } catch (FileNotFoundException missing) { /* First use. */ }
        catch (Exception failure) { throw new IOException("Cannot read offline downloads; existing files were kept", failure); }
    }

    private void save() throws IOException {
        JSONArray entries = new JSONArray();
        for (Job job : this.jobs.values()) entries.put(new JSObject().put("id", job.id).put("url", job.source.url).put("title", job.title).put("audioOnly", job.audioOnly).put("quality", job.quality)
            .put("status", job.status).put("error", job.error).put("filename", job.filename).put("bytes", job.bytes));
        byte[] data = new JSObject().put("version", 1).put("items", entries).toString().getBytes(StandardCharsets.UTF_8);
        if (data.length > 2 * 1024 * 1024) throw new IOException("Download index is full");
        FileOutputStream output = this.index.startWrite();
        try { output.write(data); this.index.finishWrite(output); }
        catch (IOException failure) { this.index.failWrite(output); throw failure; }
    }

    synchronized Job start(String url, boolean audioOnly, int quality, String retryId) throws IOException {
        if (!this.active.isEmpty()) throw new IllegalStateException("A download is running. Cancel it or wait for it to finish.");
        Job job = retryId == null ? new Job(YouTubeSource.parse(url), audioOnly, quality) : this.jobs.get(retryId);
        if (job == null) throw new IllegalArgumentException("This download is not in the list. Add its YouTube link again.");
        Job previous = this.jobs.get(job.id);
        if (previous != null && previous.status.equals("ready") && this.copy(previous) != null) return previous;
        if (previous != null) job = previous;
        this.directory(job.id);
        if (!job.filename.isEmpty()) {
            File old = DownloadProtocol.ownedFile(this.directory(job.id), new File(this.directory(job.id), job.filename).getPath());
            if (old.exists() && (!old.isFile() || old.length() != job.bytes || old.length() == 0)) this.quarantine(job.id, old);
        }
        job.status = "downloading";
        job.error = "";
        job.percent = 0;
        job.part = 0;
        job.format = "";
        this.jobs.put(job.id, job);
        try { this.save(); }
        catch (IOException failure) { job.status = "failed"; job.error = "storage"; throw failure; }
        this.active = job.id;
        return job;
    }

    synchronized File directory(String id) throws IOException {
        if (!id.matches("[A-Za-z0-9_-]{11}-(audio|video-(480|720|1080))")) throw new IOException("Invalid download identity");
        File directory = new File(this.root, id).getCanonicalFile();
        if (!this.root.equals(directory.getParentFile())) throw new IOException("Invalid download directory");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create download directory");
        return directory;
    }

    synchronized boolean running(String id) { return this.active.equals(id); }

    synchronized void quarantine(String id, File file) throws IOException {
        File owned = DownloadProtocol.ownedFile(this.directory(id), file.getPath());
        if (!owned.exists()) return;
        File rejected = new File(this.directory(id), ".rejected").getCanonicalFile();
        if (!this.directory(id).equals(rejected.getParentFile()) || (!rejected.isDirectory() && !rejected.mkdir())) throw new IOException("Cannot retain the damaged file");
        for (int idx = 1; idx <= 10000; idx++) {
            File target = new File(rejected, owned.getName() + "." + idx);
            if (target.exists()) continue;
            if (!owned.renameTo(target)) throw new IOException("Cannot retain the damaged file");
            return;
        }
        throw new IOException("Too many damaged copies");
    }

    synchronized Job job(String id) {
        Job saved = this.jobs.get(id);
        if (saved == null) return null;
        Job copy = new Job(saved.source, saved.audioOnly, saved.quality);
        copy.title = saved.title; copy.status = saved.status; copy.percent = saved.percent; copy.total = saved.total; copy.part = saved.part;
        return copy;
    }

    synchronized void requestCancel(String id) { Job job = this.jobs.get(id); if (job != null && this.running(id)) job.status = "cancelling"; }

    synchronized void title(String id, String title) {
        Job job = this.jobs.get(id);
        if (job != null && this.running(id)) job.title = title.substring(0, Math.min(300, title.length()));
    }

    synchronized void progress(String id, DownloadProtocol.Progress progress) {
        Job job = this.jobs.get(id);
        if (job == null || !this.running(id) || job.status.equals("cancelling")) return;
        job.status = "downloading";
        if (!job.format.equals(progress.format)) { job.format = progress.format; ++job.part; }
        job.bytes = progress.downloaded;
        job.total = progress.total;
        job.speed = progress.speed;
        job.eta = progress.eta;
        job.percent = progress.percent;
    }

    synchronized void finishing(String id) { Job job = this.jobs.get(id); if (job != null && this.running(id) && !job.status.equals("cancelling")) job.status = "finishing"; }

    synchronized void finish(String id, String status, String error, File file) throws IOException {
        if (!this.running(id)) return;
        Job job = this.jobs.get(id);
        try {
            if (job.status.equals("cancelling")) { status = "cancelled"; error = ""; file = null; }
            if (file != null) { job.filename = DownloadProtocol.completedFile(this.directory(id), file.getPath()).getName(); job.bytes = file.length(); job.percent = 100; }
            job.status = status;
            job.error = error;
            this.save();
        }
        catch (IOException failure) { job.status = "failed"; job.error = "storage"; throw failure; }
        finally { this.active = ""; }
    }

    private Copy copy(Job job) {
        if (!job.status.equals("ready") || job.filename.isEmpty()) return null;
        try {
            File file = DownloadProtocol.completedFile(this.directory(job.id), new File(this.directory(job.id), job.filename).getPath());
            return file.length() == job.bytes ? new Copy(job, file) : null;
        } catch (IOException failure) { return null; }
    }

    synchronized Copy ready(String sourceId, boolean video, String preferred) {
        if (preferred != null && !preferred.isEmpty()) {
            Job job = this.jobs.get(preferred);
            if (job != null && job.source.id.equals(sourceId) && (!video || !job.audioOnly)) { Copy copy = this.copy(job); if (copy != null) return copy; }
            return null;
        }
        List<Job> entries = new ArrayList<>(this.jobs.values());
        entries.sort((first, second) -> Integer.compare(first.audioOnly && !video ? 2000 : first.quality, second.audioOnly && !video ? 2000 : second.quality));
        for (int idx = entries.size() - 1; idx >= 0; idx--) {
            Job job = entries.get(idx);
            if (job.source.id.equals(sourceId) && (!video || !job.audioOnly)) { Copy copy = this.copy(job); if (copy != null) return copy; }
        }
        return null;
    }

    synchronized Copy exact(String id) { Job job = this.jobs.get(id); return job == null ? null : this.copy(job); }

    synchronized JSObject snapshot() {
        JSArray items = new JSArray();
        List<Job> entries = new ArrayList<>(this.jobs.values());
        for (int idx = entries.size() - 1; idx >= 0; idx--) {
            Job job = entries.get(idx);
            if (job.status.equals("ready") && this.copy(job) == null) { job.status = "failed"; job.error = "missing"; }
            items.put(job.snapshot());
        }
        return new JSObject().put("items", items).put("activeId", this.active.isEmpty() ? JSONObject.NULL : this.active);
    }
}

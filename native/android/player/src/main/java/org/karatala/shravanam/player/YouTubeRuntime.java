package org.karatala.shravanam.player;

import android.content.Context;
import android.util.AtomicFile;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.json.JSONObject;

// The Android library owns Python/QuickJS. The app pins the extractor and its bundled EJS.
final class YouTubeRuntime {
    static final String PRIMARY_CLIENT = "visionos";
    static final String FALLBACK_CLIENT = "web_embedded";
    private static boolean installed;
    private static JSONObject manifest;

    private static synchronized JSONObject manifest(Context context) throws Exception {
        if (manifest == null) {
            try (InputStream input = context.getResources().openRawResource(R.raw.shravanam_extractor); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 4096) throw new IOException("Extractor manifest is too large");
                    output.write(buffer, 0, count);
                }
                JSONObject value = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
                if (!value.getString("version").matches("[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}") || !value.getString("sha256").matches("[a-f0-9]{64}")) throw new IOException("Invalid packaged extractor manifest");
                manifest = value;
            }
        }
        return manifest;
    }

    static String description(Context context) throws Exception {
        JSONObject value = manifest(context);
        return value.getString("version") + " (APK bundled; EJS " + value.getString("ejsVersion") + ")";
    }

    static void configure(YoutubeDLRequest request, String client) {
        if (!PRIMARY_CLIENT.equals(client) && !FALLBACK_CLIENT.equals(client)) throw new IllegalArgumentException("Unsupported YouTube client");
        request.addOption("--extractor-args", "youtube:player_client=" + client);
    }

    static synchronized void initialize(Context context) throws Exception {
        Context app = context.getApplicationContext();
        YoutubeDL.INSTANCE.init(app);
        if (installed) return;
        JSONObject value = manifest(app);
        File target = new File(app.getNoBackupFilesDir(), "youtubedl-android/yt-dlp/yt-dlp");
        try (InputStream input = app.getResources().openRawResource(R.raw.shravanam_ytdlp)) {
            install(target, input, value.getString("sha256"));
        }
        installed = true;
        PlaybackDiagnostics.record("youtube.runtime.ready", description(app));
    }

    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException failure) { throw new IllegalStateException("SHA-256 is unavailable", failure); }
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) { result.append(Character.forDigit((value & 255) >> 4, 16)); result.append(Character.forDigit(value & 15, 16)); }
        return result.toString();
    }

    private static void copy(InputStream input, FileOutputStream output, MessageDigest digest) throws IOException {
        byte[] buffer = new byte[65536];
        int count;
        int total = 0;
        while ((count = input.read(buffer)) != -1) {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Extractor installation cancelled");
            total += count;
            if (total > 16 * 1024 * 1024) throw new IOException("Packaged extractor is too large");
            digest.update(buffer, 0, count);
            if (output != null) output.write(buffer, 0, count);
        }
    }

    static boolean install(File target, InputStream packaged, String expected) throws IOException {
        if (target.isFile()) {
            MessageDigest current = digest();
            try (InputStream input = new FileInputStream(target)) { copy(input, null, current); }
            if (hex(current.digest()).equals(expected)) return false;
        }
        File parent = target.getParentFile();
        if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create the extractor directory");
        AtomicFile atomic = new AtomicFile(target);
        FileOutputStream output = atomic.startWrite();
        try {
            MessageDigest checksum = digest();
            copy(packaged, output, checksum);
            if (!hex(checksum.digest()).equals(expected)) throw new IOException("Packaged extractor checksum does not match");
            atomic.finishWrite(output);
            return true;
        } catch (IOException | RuntimeException failure) { atomic.failWrite(output); throw failure; }
    }
}

package org.karatala.shravanam.player;

import android.content.Context;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import java.net.URI;
import java.net.URL;
import java.net.HttpURLConnection;
import java.io.InputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Iterator;
import java.util.HashSet;
import java.util.Set;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

final class YouTubeResolver {
    static final class UnsupportedLive extends Exception {}
    static final class Stream {
        final String url;
        final String title;
        final Map<String, String> headers;
        Stream(String url, String title, Map<String, String> headers) { this.url = url; this.title = title; this.headers = Collections.unmodifiableMap(headers); }
    }

    static Stream resolve(Context context, YouTubeSource source, String processId) throws Exception {
        return resolve(context, source, processId, false);
    }

    static Stream resolveVideo(Context context, YouTubeSource source, String processId) throws Exception {
        return resolve(context, source, processId, true);
    }

    private static Stream resolve(Context context, YouTubeSource source, String processId, boolean video) throws Exception {
        YoutubeDL.INSTANCE.init(context.getApplicationContext());
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
        YoutubeDLRequest request = new YoutubeDLRequest(source.url);
        for (String option : new String[] { "--ignore-config", "--no-plugin-dirs", "--no-remote-components", "--no-cache-dir", "--no-playlist", "--no-check-formats", "--skip-download", "--dump-single-json" }) request.addOption(option);
        request.addOption("--socket-timeout", "15").addOption("--retries", "1").addOption("--extractor-retries", "1").addOption("-f", video ? "bestvideo[protocol=https][height<=1080]/best[protocol=https][height<=1080]" : "bestaudio[protocol=https]/best[protocol=https]");
        if (video) request.addOption("-S", "res:1080,vcodec:h264");
        String output = YoutubeDL.INSTANCE.execute(request, processId).getOut();
        Stream selected = parse(output, source, video);
        if (available(selected)) return selected;
        JSONObject info = new JSONObject(output);
        JSONArray formats = info.optJSONArray("formats");
        Set<String> tried = new HashSet<>();
        tried.add(selected.url);
        // yt-dlp format checks use a temporary media file. Probe alternatives in memory instead.
        if (formats != null) for (int pass = 0; pass < 2; pass++) for (int idx = formats.length() - 1; idx >= 0; idx--) {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
            JSONObject candidate = formats.getJSONObject(idx);
            String otherCodec = candidate.optString(video ? "acodec" : "vcodec", "none");
            if (candidate.optBoolean("has_drm") || (otherCodec.equals("none") != (pass == 0))) continue;
            Stream alternative;
            try { alternative = stream(info, candidate, video); }
            catch (Exception failure) { continue; }
            if (!tried.add(alternative.url)) continue;
            if (tried.size() > 6) throw new IOException("No available audio stream");
            if (available(alternative)) return alternative;
        }
        throw new IOException("No available audio stream");
    }

    private static boolean available(Stream stream) throws InterruptedException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(stream.url).openConnection();
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            for (Map.Entry<String, String> header : stream.headers.entrySet()) connection.setRequestProperty(header.getKey(), header.getValue());
            connection.setRequestProperty("Range", "bytes=0-0");
            int status = connection.getResponseCode();
            if (status != 200 && status != 206) return false;
            try (InputStream input = connection.getInputStream()) { return input.read() >= 0; }
        } catch (IOException failure) { return false; }
        finally { if (connection != null) connection.disconnect(); }
    }

    static Stream parse(String output, YouTubeSource source) throws Exception {
        return parse(output, source, false);
    }

    static Stream parse(String output, YouTubeSource source, boolean video) throws Exception {
        if (output.length() > 8 * 1024 * 1024) throw new IllegalArgumentException("YouTube metadata is too large");
        JSONObject info = new JSONObject(output);
        if (!source.videoId.equals(info.optString("id")) || "playlist".equals(info.optString("_type"))) throw new IllegalArgumentException("Unexpected source");
        if (info.optBoolean("is_live") || "is_upcoming".equals(info.optString("live_status"))) throw new UnsupportedLive();
        JSONObject format = info;
        JSONArray formats = info.optJSONArray("requested_formats");
        if (formats != null) {
            format = null;
            for (int idx = 0; idx < formats.length(); idx++) {
                JSONObject candidate = formats.getJSONObject(idx);
                String codec = candidate.optString(video ? "vcodec" : "acodec");
                if (!codec.isEmpty() && !codec.equals("none")) { format = candidate; break; }
            }
        }
        return stream(info, format, video);
    }

    private static Stream stream(JSONObject info, JSONObject format, boolean video) throws Exception {
        String codec = format == null ? "" : format.optString(video ? "vcodec" : "acodec");
        if (format == null || codec.isEmpty() || codec.equals("none") || !"https".equals(format.optString("protocol")) || (video && format.optInt("height") > 1080)) throw new IllegalArgumentException("Missing supported stream");
        URI uri = new URI(format.getString("url"));
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || !uri.getHost().endsWith(".googlevideo.com") || uri.getPort() != -1 || uri.getRawUserInfo() != null || uri.getRawFragment() != null) throw new IllegalArgumentException("Unsupported stream address");
        JSONObject headerValues = format.optJSONObject("http_headers");
        if (headerValues == null) headerValues = info.optJSONObject("http_headers");
        Map<String, String> headers = new LinkedHashMap<>();
        if (headerValues != null) {
            if (headerValues.length() > 32) throw new IllegalArgumentException("Too many stream headers");
            for (Iterator<String> names = headerValues.keys(); names.hasNext();) {
                String name = names.next();
                Object value = headerValues.get(name);
                if (!name.matches("[A-Za-z0-9-]+") || !(value instanceof String) || ((String) value).length() > 8192 || ((String) value).matches("(?s).*[\\r\\n\\x00].*")) throw new IllegalArgumentException("Invalid stream header");
                headers.put(name, (String) value);
            }
        }
        String title = info.optString("title", info.getString("id"));
        if (title.trim().isEmpty()) title = info.getString("id");
        return new Stream(uri.toString(), title.substring(0, Math.min(300, title.length())), headers);
    }
}

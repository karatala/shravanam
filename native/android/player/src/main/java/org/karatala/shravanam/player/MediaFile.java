package org.karatala.shravanam.player;

import android.content.ContentResolver;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.CancellationSignal;
import android.provider.OpenableColumns;
import com.getcapacitor.JSObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import org.json.JSONObject;

final class MediaFile {
    static final class UnsupportedFormat extends Exception {
        UnsupportedFormat(String name) { super(name); }
    }
    final String id;
    final Uri uri;
    final String name;
    final String kind;
    final boolean temporary;

    private MediaFile(String id, Uri uri, String name, String kind, boolean temporary) {
        this.id = id;
        this.uri = uri;
        this.name = name;
        this.kind = kind;
        this.temporary = temporary;
    }

    static MediaFile read(ContentResolver resolver, Uri uri, JSONObject types, CancellationSignal cancellation) throws Exception {
        if (!"content".equals(uri.getScheme())) throw new SecurityException("Only granted content URIs are accepted");
        String name = uri.getLastPathSegment();
        long size = -1;
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null, cancellation)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn);
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn);
            }
        }
        if (name == null || name.isEmpty()) name = "Media";
        String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String kind = types.optString(extension, "");
        if (kind.isEmpty()) {
            String mime = resolver.getType(uri);
            if (mime != null && mime.startsWith("audio/")) kind = "audio";
            else if (mime != null && mime.startsWith("video/")) kind = "video";
            else throw new UnsupportedFormat(name);
        }
        try (AssetFileDescriptor descriptor = resolver.openAssetFileDescriptor(uri, "r", cancellation)) {
            if (descriptor == null) throw new IOException("Cannot read selected media");
        }
        boolean temporary = true;
        for (android.content.UriPermission permission : resolver.getPersistedUriPermissions()) {
            if (permission.isReadPermission() && permission.getUri().equals(uri)) { temporary = false; break; }
        }
        byte[] digest = MessageDigest.getInstance("SHA-256").digest((uri.toString() + "\0" + size).getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder();
        for (byte value : digest) {
            id.append(Character.forDigit((value & 255) >> 4, 16));
            id.append(Character.forDigit(value & 15, 16));
        }
        return new MediaFile(id.toString(), uri, name, kind, temporary);
    }

    JSObject snapshot() {
        return new JSObject().put("id", this.id).put("name", this.name).put("kind", this.kind).put("temporary", this.temporary);
    }

    JSObject stored() { return this.snapshot().put("uri", this.uri.toString()); }

    boolean youtube() { return "https".equals(this.uri.getScheme()); }

    static MediaFile youtube(YouTubeSource source, String title) { return new MediaFile(source.id, Uri.parse(source.url), title, "video", false); }

    static MediaFile fromStored(JSONObject value) throws Exception {
        String id = value.getString("id");
        Uri uri = Uri.parse(value.getString("uri"));
        String name = value.getString("name");
        String kind = value.getString("kind");
        if ("https".equals(uri.getScheme())) {
            YouTubeSource source = YouTubeSource.parse(uri.toString());
            if (!id.equals(source.id) || !uri.toString().equals(source.url) || name.isEmpty()) throw new IOException("Invalid recent YouTube source");
            return youtube(source, name);
        }
        if (!id.matches("[a-f0-9]{64}") || !"content".equals(uri.getScheme()) || name.isEmpty() || !("audio".equals(kind) || "video".equals(kind))) throw new IOException("Invalid recent media");
        return new MediaFile(id, uri, name, kind, value.getBoolean("temporary"));
    }
}

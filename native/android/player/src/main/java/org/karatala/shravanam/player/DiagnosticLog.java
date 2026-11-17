package org.karatala.shravanam.player;

import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Date;
import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Pattern;

// Process memory only. Redact before either storing or sending text to Logcat.
final class DiagnosticLog {
    private static final int MAX_EVENT = 12000;
    private static final int MAX_REPORT = 48000;
    private static final Pattern SECRETS = Pattern.compile("(?im)^.*(?:cookie|authorization|http_headers|proxy|password|secret|(?:access[_-]?|po[_-]?)?token|signature)\\s*[\\\"']?\\s*[:=].*$");
    private static final Pattern URLS = Pattern.compile("(?i)\\b(?:https?|ftp|rtsp|content|file|data|blob):[^\\s\\\"'<>]+|https?%3a[^\\s\\\"'<>]+");
    private static final Pattern QUOTED_PATHS = Pattern.compile("(?i)\\\"(?:[a-z]:[\\\\/]|/|\\\\\\\\)[^\\\"\\r\\n]*\\\"|'(?:[a-z]:[\\\\/]|/|\\\\\\\\)[^'\\r\\n]*'");
    private static final Pattern PATHS = Pattern.compile("(?i)(?:[a-z]:[\\\\/]|\\\\\\\\)[^\\s\\\"'<>|,;)\\]]+|(?<![a-z0-9_])/(?:[^\\s\\\"'<>:,;()\\[\\]]+/)*[^\\s\\\"'<>:,;()\\[\\]]+");
    private final ArrayDeque<String> events = new ArrayDeque<>();
    private int length;

    static String timestamp(long time) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(time));
    }

    static String redact(String value) {
        if (value == null) return "";
        String clean = SECRETS.matcher(value).replaceAll("[private headers or credentials omitted]");
        clean = URLS.matcher(clean).replaceAll("[URL]");
        clean = QUOTED_PATHS.matcher(clean).replaceAll("[path]");
        return PATHS.matcher(clean).replaceAll("[path]").replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", "");
    }

    private static String bounded(String value) {
        if (value.length() <= MAX_EVENT) return value;
        return value.substring(0, MAX_EVENT / 2) + "\n[truncated]\n" + value.substring(value.length() - MAX_EVENT / 2);
    }

    synchronized String add(String stage, String detail, Throwable failure) {
        StringBuilder event = new StringBuilder(timestamp(System.currentTimeMillis())).append(' ').append(redact(stage)).append('\n').append(bounded(redact(detail)));
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        int depth = 0;
        for (Throwable cause = failure; cause != null && depth < 8 && seen.add(cause); cause = cause.getCause(), depth++) {
            event.append('\n').append(depth == 0 ? "" : "Caused by: ").append(cause.getClass().getName()).append(": ").append(bounded(redact(cause.getMessage())));
            StackTraceElement[] frames = cause.getStackTrace();
            for (int idx = 0; idx < Math.min(6, frames.length); idx++) event.append("\n  at ").append(redact(frames[idx].toString()));
        }
        String entry = bounded(event.toString()) + "\n\n";
        this.events.addLast(entry);
        this.length += entry.length();
        while (this.events.size() > 60 || this.length > MAX_REPORT) this.length -= this.events.removeFirst().length();
        return entry;
    }

    synchronized String report() {
        StringBuilder report = new StringBuilder(this.length);
        for (String event : this.events) report.append(event);
        return report.toString();
    }
}

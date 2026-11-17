package org.karatala.shravanam.player;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class YouTubeSource {
    final String videoId;
    final String url;
    final String id;
    final Long start;

    private YouTubeSource(String videoId, Long start) throws Exception {
        this.videoId = videoId;
        this.url = "https://www.youtube.com/watch?v=" + videoId;
        this.start = start;
        StringBuilder digest = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(("youtube\0" + videoId).getBytes(StandardCharsets.UTF_8))) {
            digest.append(Character.forDigit((value & 255) >> 4, 16));
            digest.append(Character.forDigit(value & 15, 16));
        }
        this.id = digest.toString();
    }

    private static Map<String, String> parameters(String query) throws Exception {
        Map<String, String> values = new LinkedHashMap<>();
        if (query != null) for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            values.putIfAbsent(URLDecoder.decode(parts[0], "UTF-8"), parts.length == 2 ? URLDecoder.decode(parts[1], "UTF-8") : "");
        }
        return values;
    }

    static YouTubeSource parse(String input) {
        try {
            if (input == null || input.length() > 2048) throw new IllegalArgumentException();
            URI uri = new URI(input.trim());
            String hostname = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getPort() != -1) throw new IllegalArgumentException();
            Map<String, String> query = parameters(uri.getRawQuery());
            String path = uri.getPath();
            String videoId = null;
            if (hostname.equals("youtu.be") && path.matches("/[A-Za-z0-9_-]{11}")) videoId = path.substring(1);
            if (hostname.matches("(?:www\\.|m\\.|music\\.)?youtube\\.com")) {
                if (path.equals("/watch")) videoId = query.get("v");
                else if (path.matches("/(?:shorts|live|embed)/[A-Za-z0-9_-]{11}")) videoId = path.substring(path.lastIndexOf('/') + 1);
            }
            if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) throw new IllegalArgumentException();
            String time = query.containsKey("t") ? query.get("t") : query.containsKey("start") ? query.get("start") : parameters(uri.getRawFragment()).get("t");
            Long start = null;
            if (time != null) {
                long seconds;
                if (time.matches("[0-9]+")) seconds = Long.parseLong(time);
                else {
                    Matcher match = Pattern.compile("(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?").matcher(time);
                    if (time.isEmpty() || !match.matches()) throw new IllegalArgumentException();
                    seconds = 0;
                    for (int idx = 1; idx <= 3; idx++) if (match.group(idx) != null) seconds = Math.addExact(seconds, Math.multiplyExact(Long.parseLong(match.group(idx)), idx == 1 ? 3600 : idx == 2 ? 60 : 1));
                }
                if (seconds > Integer.MAX_VALUE) throw new IllegalArgumentException();
                start = seconds * 1000;
            }
            return new YouTubeSource(videoId, start);
        } catch (Exception failure) { throw new IllegalArgumentException("Invalid YouTube link", failure); }
    }
}

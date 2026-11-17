package org.karatala.shravanam.player;

import java.net.URI;
import java.net.URLEncoder;

final class SourceBrowserUrl {
    static String address(String input) {
        try {
            String value = input == null ? "" : input.trim();
            if (value.length() > 8192) throw new IllegalArgumentException();
            if (value.isEmpty()) return "https://m.youtube.com";
            if (!value.matches("[A-Za-z][A-Za-z0-9+.-]*:.*")) {
                if (value.contains(".") && !value.matches("(?s).*\\s.*")) value = "https://" + value;
                else return "https://m.youtube.com/results?search_query=" + URLEncoder.encode(value, "UTF-8");
            }
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getHost().isEmpty() || uri.getRawUserInfo() != null || uri.getPort() != -1) throw new IllegalArgumentException();
            return uri.toASCIIString();
        } catch (Exception failure) { throw new IllegalArgumentException("Use an HTTPS address or a YouTube search", failure); }
    }

    static boolean navigable(String url) {
        try { return new URI(url).isAbsolute() && address(url).equals(new URI(url).toASCIIString()); }
        catch (Exception failure) { return false; }
    }
}

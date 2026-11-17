package org.karatala.shravanam.player;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

public final class DevelopmentServerUrl {
    private DevelopmentServerUrl() {}

    public static String normalize(String value) {
        String candidate = value == null ? "" : value.trim();
        try {
            URI uri = new URI(candidate);
            String hostname = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            String path = uri.getRawPath();
            if (!"http".equalsIgnoreCase(uri.getScheme()) || uri.getPort() != 3001 || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || (path != null && !path.isEmpty() && !path.equals("/"))) throw new IllegalArgumentException();
            if (!hostname.equals("localhost")) {
                String[] parts = hostname.split("\\.", -1);
                if (parts.length != 4) throw new IllegalArgumentException();
                int[] address = new int[4];
                for (int idx = 0; idx < parts.length; idx++) {
                    if (!parts[idx].matches("0|[1-9][0-9]{0,2}")) throw new IllegalArgumentException();
                    address[idx] = Integer.parseInt(parts[idx]);
                    if (address[idx] > 255) throw new IllegalArgumentException();
                }
                if (!(address[0] == 10 || address[0] == 127 || (address[0] == 192 && address[1] == 168) || (address[0] == 172 && address[1] >= 16 && address[1] <= 31))) throw new IllegalArgumentException();
            }
            return "http://" + hostname + ":3001";
        } catch (URISyntaxException | IllegalArgumentException failure) {
            throw new IllegalArgumentException("Invalid development server address", failure);
        }
    }
}

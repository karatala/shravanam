package org.karatala.shravanam.player;

import java.io.File;
import java.io.IOException;
import org.json.JSONArray;

// Only these bounded, structured stdout records reach download state.
final class DownloadProtocol {
    static final String TITLE = "SHRAVANAM_TITLE:";
    static final String FILE = "SHRAVANAM_FILE:";
    static final String PROGRESS = "SHRAVANAM_PROGRESS:";
    static final String FINISH = "SHRAVANAM_FINISH:";

    static int quality(int value) {
        if (value != 480 && value != 720 && value != 1080) throw new IllegalArgumentException("Choose 480p, 720p, or 1080p.");
        return value;
    }

    static String format(boolean audioOnly, int quality) {
        if (audioOnly) return "bestaudio[protocol=https]/best[protocol=https]";
        String height = "[height<=" + quality(quality) + "]";
        return "bestvideo[protocol=https]" + height + "+bestaudio[protocol=https]/best[protocol=https]" + height;
    }

    static String string(String value) throws Exception {
        if (value.length() > 16384) throw new IOException("Download record is too large");
        JSONArray decoded = new JSONArray("[" + value + "]");
        if (decoded.length() != 1 || !(decoded.get(0) instanceof String)) throw new IOException("Invalid download record");
        return decoded.getString(0);
    }

    static File ownedFile(File directory, String path) throws IOException {
        File file = new File(path).getCanonicalFile();
        if (!directory.getCanonicalFile().equals(file.getParentFile()) || !file.getName().matches("media\\.(m4a|aac|mp3|opus|ogg|flac|wav|mp4|mkv|webm)")) throw new IOException("Invalid completed download path");
        return file;
    }

    static File completedFile(File directory, String path) throws IOException {
        File file = ownedFile(directory, path);
        if (!file.isFile() || !file.canRead() || file.length() <= 0) throw new IOException("The downloaded file is missing or empty");
        return file;
    }

    static final class Progress {
        final long downloaded;
        final long total;
        final long eta;
        final double speed;
        final String format;
        final int percent;
        Progress(String value) {
            String[] fields = value.split("\\|", -1);
            if (fields.length != 6 || value.length() > 512 || !fields[5].matches("[A-Za-z0-9_+.-]{1,100}")) throw new IllegalArgumentException("Invalid download progress");
            this.downloaded = number(fields[1]);
            this.total = number(fields[2]);
            this.eta = number(fields[3]);
            this.speed = number(fields[4]);
            this.format = fields[5];
            this.percent = this.total > 0 ? (int) Math.max(0, Math.min(99, 100.0 * this.downloaded / this.total)) : 0;
        }
        private static long number(String value) {
            try { double number = Double.parseDouble(value); return Double.isFinite(number) && number >= 0 ? (long) Math.min(Long.MAX_VALUE, number) : 0; }
            catch (NumberFormatException failure) { return 0; }
        }
    }
}

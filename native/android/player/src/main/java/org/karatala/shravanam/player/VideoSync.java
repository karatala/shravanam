package org.karatala.shravanam.player;

final class VideoSync {
    static final class Decision {
        final long seekTo;
        final boolean play;
        final boolean show;
        Decision(long seekTo, boolean play, boolean show) { this.seekTo = seekTo; this.play = play; this.show = show; }
    }

    static Decision decide(long audioPosition, long videoPosition, boolean ready, boolean playing, long bufferTime, float speed) {
        if (!ready) return new Decision(-1, false, false);
        long difference = videoPosition - audioPosition;
        if (!playing) return Math.abs(difference) > 100 ? new Decision(audioPosition, false, false) : new Decision(-1, false, true);
        if (difference > 100) return new Decision(-1, false, false);
        if (difference < -100) return new Decision(seekTarget(audioPosition, playing, bufferTime, speed), false, false);
        return new Decision(-1, true, true);
    }

    static long seekTarget(long audioPosition, boolean playing, long bufferTime, float speed) { return audioPosition + (playing ? Math.min(3000, Math.max(100, Math.round(bufferTime * speed) + 100)) : 0); }
    static boolean jumped(long previous, long current, long elapsed, boolean wasPlaying, float speed) { return Math.abs(current - previous - (wasPlaying ? Math.round(elapsed * speed) : 0)) > 400; }
}

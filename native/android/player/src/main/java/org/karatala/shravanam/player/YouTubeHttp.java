package org.karatala.shravanam.player;

import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.TransferListener;
import java.io.IOException;
import java.util.Map;

@OptIn(markerClass = UnstableApi.class)
final class YouTubeHttp {
    static DefaultHttpDataSource.Factory factory(Map<String, String> headers, String stage) {
        return new DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers).setTransferListener(new TransferListener() {
            @Override public void onTransferInitializing(DataSource source, DataSpec request, boolean network) {
                PlaybackDiagnostics.record(stage + ".http.open", "position=" + request.position + " length=" + request.length + " method=" + request.httpMethod);
            }
            @Override public void onTransferStart(DataSource source, DataSpec request, boolean network) {
                if (source instanceof DefaultHttpDataSource) PlaybackDiagnostics.record(stage + ".http.response", "HTTP " + ((DefaultHttpDataSource) source).getResponseCode() + " position=" + request.position + " length=" + request.length);
            }
            @Override public void onBytesTransferred(DataSource source, DataSpec request, boolean network, int bytes) {}
            @Override public void onTransferEnd(DataSource source, DataSpec request, boolean network) {}
        });
    }

    static boolean available(DataSource source, String url, String stage, String processId, int attempt) throws InterruptedException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
        try {
            // Match the player's initial open-ended request. A bytes=0-0 request can pass while full playback gets 403.
            source.open(new DataSpec.Builder().setUri(url).build());
            boolean readable = source.read(new byte[1], 0, 1) == 1;
            PlaybackDiagnostics.record(stage + ".probe.done", processId + " attempt=" + attempt + " openEnded=true readable=" + readable);
            return readable;
        } catch (IOException failure) {
            String status = failure instanceof HttpDataSource.InvalidResponseCodeException ? " HTTP " + ((HttpDataSource.InvalidResponseCodeException) failure).responseCode : "";
            PlaybackDiagnostics.record(stage + ".probe.failed", processId + " attempt=" + attempt + status, failure);
            return false;
        } finally {
            try { source.close(); }
            catch (IOException failure) { PlaybackDiagnostics.record(stage + ".probe.close.failed", processId, failure); }
        }
    }
}

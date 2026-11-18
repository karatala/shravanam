package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import android.net.Uri;
import androidx.annotation.OptIn;
import androidx.media3.common.C;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSpec;
import java.io.IOException;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@OptIn(markerClass = UnstableApi.class)
@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE, sdk = 28)
public final class YouTubeHttpTest {
    private static final class RequestSource extends BaseDataSource {
        private final boolean denied;
        DataSpec request;
        boolean closed;
        int readLength;
        RequestSource(boolean denied) { super(true); this.denied = denied; }
        @Override public long open(DataSpec request) throws IOException { this.request = request; if (this.denied) throw new IOException("HTTP 403"); return C.LENGTH_UNSET; }
        @Override public int read(byte[] buffer, int offset, int length) { this.readLength = length; buffer[offset] = 1; return 1; }
        @Override public Uri getUri() { return this.request == null ? null : this.request.uri; }
        @Override public void close() { this.closed = true; }
    }

    @Test public void probesThePlayerRequestWithoutAOneByteRangeButReadsOnlyOneByte() throws Exception {
        RequestSource source = new RequestSource(false);
        assertTrue(YouTubeHttp.available(source, "https://rr1.googlevideo.com/video", "test", "test", 1));
        assertEquals(0, source.request.position);
        assertEquals(C.LENGTH_UNSET, source.request.length);
        assertEquals(DataSpec.HTTP_METHOD_GET, source.request.httpMethod);
        assertTrue(source.request.httpRequestHeaders.isEmpty());
        assertEquals(1, source.readLength);
        assertTrue(source.closed);
    }

    @Test public void rejectsAndClosesAnUnavailableOpenEndedStream() throws Exception {
        RequestSource source = new RequestSource(true);
        assertFalse(YouTubeHttp.available(source, "https://rr1.googlevideo.com/video", "test", "test", 1));
        assertEquals(0, source.readLength);
        assertTrue(source.closed);
    }
}

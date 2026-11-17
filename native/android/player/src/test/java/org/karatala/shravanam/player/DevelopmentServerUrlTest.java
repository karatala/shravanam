package org.karatala.shravanam.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import org.junit.Test;

public final class DevelopmentServerUrlTest {
    @Test
    public void acceptsLocalOriginsWithoutChangingTheirHost() {
        assertEquals("http://192.168.1.10:3001", DevelopmentServerUrl.normalize(" http://192.168.1.10:3001/ "));
        assertEquals("http://localhost:3001", DevelopmentServerUrl.normalize("HTTP://LOCALHOST:3001"));
        for (String address : new String[] { "10.0.2.2", "127.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.255.255" }) {
            assertEquals("http://" + address + ":3001", DevelopmentServerUrl.normalize("http://" + address + ":3001"));
        }
    }

    @Test
    public void rejectsOtherOriginsAndNonRootUrls() {
        for (String address : new String[] { "", "https://192.168.1.10:3001", "http://192.168.1.10", "http://192.168.1.10:3000", "http://8.8.8.8:3001", "http://example.com:3001", "http://172.15.0.1:3001", "http://172.32.0.1:3001", "http://0.0.0.0:3001", "http://user:pass@192.168.1.10:3001", "http://192.168.1.10:3001/app", "http://192.168.1.10:3001/?query", "http://192.168.1.10:3001/#fragment", "http://[::1]:3001", "http://192.168.999.1:3001", "http://192.168.01.1:3001" }) {
            assertThrows("Rejected address: " + address, IllegalArgumentException.class, () -> DevelopmentServerUrl.normalize(address));
        }
        assertThrows(IllegalArgumentException.class, () -> DevelopmentServerUrl.normalize(null));
    }
}

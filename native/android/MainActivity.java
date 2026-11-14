package org.karatala.shravanam;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.karatala.shravanam.player.ShravanamPlayerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        this.registerPlugin(ShravanamPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package org.karatala.shravanam.player;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.graphics.Typeface;
import android.os.Build;
import android.text.TextUtils;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.annotation.OptIn;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.HttpDataSource;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

@OptIn(markerClass = UnstableApi.class)
final class PlaybackDiagnostics {
    private static final DiagnosticLog LOG = new DiagnosticLog();
    private static volatile boolean active;

    static boolean enabled(Context context) { return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0; }
    static void initialize(Context context) { active = enabled(context); }

    static void record(String stage, String detail) { record(stage, detail, null); }

    static void record(String stage, String detail, Throwable failure) {
        if (!active) return;
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable cause = failure; cause != null && seen.size() < 8 && seen.add(cause); cause = cause.getCause()) {
            if (cause instanceof PlaybackException) detail += "\nMedia3 " + ((PlaybackException) cause).getErrorCodeName() + " (" + ((PlaybackException) cause).errorCode + ")";
            if (cause instanceof HttpDataSource.InvalidResponseCodeException) detail += "\nHTTP " + ((HttpDataSource.InvalidResponseCodeException) cause).responseCode;
        }
        String entry = LOG.add(stage, detail, failure);
        for (int offset = 0; offset < entry.length(); offset += 3000) Log.d("ShravanamDebug", entry.substring(offset, Math.min(entry.length(), offset + 3000)));
    }

    @SuppressWarnings("deprecation")
    private static String report(Context context) {
        String app;
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            app = info.versionName + " (" + (Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode) + "), installed " + DiagnosticLog.timestamp(info.lastUpdateTime);
        } catch (Exception failure) { app = "version unavailable"; }
        String extractor;
        try { extractor = YouTubeRuntime.description(context); }
        catch (Exception failure) { extractor = "version unavailable"; }
        return DiagnosticLog.redact("Shravanam Android diagnostics\nReport: " + DiagnosticLog.timestamp(System.currentTimeMillis()) + "\nAPK: " + app + "\nDebug: " + enabled(context)
            + "\nAndroid: " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")\nDevice: " + Build.MANUFACTURER + " " + Build.MODEL
            + "\nABI: " + TextUtils.join(", ", Build.SUPPORTED_ABIS) + "\nMedia3: 1.11.1\nyoutubedl-android: 0.18.1\nyt-dlp: " + extractor
            + "\nMemory log, cleared when the app process exits. URLs, paths and credentials omitted.\n\n") + LOG.report();
    }

    static void show(Activity activity) {
        initialize(activity);
        if (!active || activity.isFinishing() || activity.isDestroyed()) return;
        TextView output = new TextView(activity);
        output.setTextSize(11);
        output.setTypeface(Typeface.MONOSPACE);
        output.setTextIsSelectable(true);
        int padding = NativeControls.pixels(activity, 12);
        output.setPadding(padding, padding, padding, padding);
        output.setText(report(activity));
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(output, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(NativeControls.text(activity, "Playback diagnostics", "Диагностика плеера")).setView(scroll)
            .setPositiveButton(NativeControls.text(activity, "Copy", "Копировать"), null)
            .setNeutralButton(NativeControls.text(activity, "Refresh", "Обновить"), null)
            .setNegativeButton(NativeControls.text(activity, "Close", "Закрыть"), null).create();
        dialog.setOnShowListener(ignored -> {
            scroll.getLayoutParams().height = Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.55f);
            scroll.requestLayout();
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view -> output.setText(report(activity)));
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard == null) return;
                clipboard.setPrimaryClip(ClipData.newPlainText("Shravanam diagnostics", output.getText()));
                Toast.makeText(activity, NativeControls.text(activity, "Diagnostics copied", "Диагностика скопирована"), Toast.LENGTH_SHORT).show();
            });
        });
        dialog.show();
    }
}

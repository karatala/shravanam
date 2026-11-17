package org.karatala.shravanam.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import androidx.appcompat.app.AlertDialog;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public final class DevelopmentServer {
    private static final String PREFERENCES = "shravanam-development";
    private static final String SERVER_URL = "server-url";

    private DevelopmentServer() {}

    private static boolean enabled(Context context) { return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0; }
    private static SharedPreferences preferences(Context context) { return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE); }
    private static int pixels(Context context, int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    private static String text(Context context, String english, String russian) { return context.getResources().getConfiguration().getLocales().get(0).getLanguage().equals("ru") ? russian : english; }

    public static CapConfig configuration(BridgeActivity activity) {
        if (!enabled(activity)) return null;
        String bundledUrl = CapConfig.loadDefault(activity).getServerUrl();
        String selectedUrl = preferences(activity).getString(SERVER_URL, bundledUrl == null ? "" : bundledUrl);
        if (!selectedUrl.isEmpty()) {
            try { selectedUrl = DevelopmentServerUrl.normalize(selectedUrl); }
            catch (IllegalArgumentException failure) { selectedUrl = ""; }
        }
        // Rebuild the bridge for the selected origin so Capacitor plugins stay available there.
        return new CapConfig.Builder(activity).setServerUrl(selectedUrl.isEmpty() ? null : selectedUrl).setInitialFocus(true).create();
    }

    public static void installButton(BridgeActivity activity) {
        if (!enabled(activity) || activity.getBridge() == null) return;
        ViewGroup content = activity.findViewById(android.R.id.content);
        Button button = new Button(activity);
        button.setText(text(activity, "Server", "Сервер"));
        button.setContentDescription(text(activity, "Development server settings", "Настройки сервера разработки"));
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setTextColor(Color.rgb(254, 201, 101));
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(pixels(activity, 10), 0, pixels(activity, 10), 0);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(38, 38, 38));
        background.setCornerRadius(pixels(activity, 5));
        button.setBackground(background);
        button.setElevation(pixels(activity, 4));
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, pixels(activity, 32), Gravity.TOP | Gravity.END);
        layout.topMargin = pixels(activity, 6);
        layout.rightMargin = pixels(activity, 10);
        content.addView(button, layout);
        ViewCompat.setOnApplyWindowInsetsListener(button, (view, windowInsets) -> {
            Insets safe = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            layout.topMargin = safe.top + pixels(activity, 6);
            layout.rightMargin = safe.right + pixels(activity, 10);
            button.setLayoutParams(layout);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(button);
        button.setOnClickListener(view -> { button.clearFocus(); showSettings(activity); });
    }

    private static void showSettings(BridgeActivity activity) {
        if (!enabled(activity) || activity.isFinishing()) return;
        String currentUrl = activity.getBridge().getServerUrl();
        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(pixels(activity, 20), pixels(activity, 8), pixels(activity, 20), 0);
        EditText address = new EditText(activity);
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setHint("http://192.168.1.10:3001");
        address.setText(currentUrl == null ? "" : currentUrl);
        address.setSelectAllOnFocus(true);
        content.addView(address, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(NativeControls.button(activity, text(activity, "Playback diagnostics", "Диагностика плеера"), view -> PlaybackDiagnostics.show(activity)));
        AlertDialog dialog = new AlertDialog.Builder(activity)
            .setTitle(text(activity, "Development server", "Сервер разработки"))
            .setMessage(text(activity, "Current interface: ", "Текущий интерфейс: ") + (currentUrl == null ? text(activity, "built-in", "встроенный") : currentUrl))
            .setView(content)
            .setPositiveButton(text(activity, "Connect", "Подключить"), null)
            .setNeutralButton(text(activity, "Built-in interface", "Встроенный интерфейс"), null)
            .setNegativeButton(text(activity, "Cancel", "Отмена"), null)
            .create();
        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                try { switchInterface(activity, DevelopmentServerUrl.normalize(address.getText().toString()), dialog, address); }
                catch (IllegalArgumentException failure) {
                    address.setError(text(activity, "Cannot use this address. Enter a local HTTP address on port 3001, for example http://192.168.1.10:3001, without a path or password.", "Этот адрес не подходит. Введите локальный HTTP-адрес с портом 3001, например http://192.168.1.10:3001, без пути и пароля."));
                }
            });
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view -> switchInterface(activity, "", dialog, address));
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setEnabled(currentUrl != null);
        });
        dialog.setOnDismissListener(ignored -> {
            if (!activity.isFinishing() && !activity.isDestroyed()) activity.getBridge().getWebView().requestFocus();
        });
        dialog.show();
    }

    private static void switchInterface(BridgeActivity activity, String url, AlertDialog dialog, EditText address) {
        if (!enabled(activity)) return;
        if (!preferences(activity).edit().putString(SERVER_URL, url).commit()) {
            address.setError(text(activity, "Cannot save the server address. Check free storage and try again.", "Не удалось сохранить адрес сервера. Проверьте свободное место и повторите попытку."));
            return;
        }
        dialog.dismiss();
        // Activity recreation releases the interface controller, not the Media3 playback service.
        activity.recreate();
    }
}

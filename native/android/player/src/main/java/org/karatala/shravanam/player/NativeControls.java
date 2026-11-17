package org.karatala.shravanam.player;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

final class NativeControls {
    static int pixels(Context context, int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    static String text(Context context, String english, String russian) { return context.getResources().getConfiguration().getLocales().get(0).getLanguage().equals("ru") ? russian : english; }

    static Button button(Context context, String label, View.OnClickListener action) {
        Button button = new Button(context);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setHeight(pixels(context, 30));
        button.setTextColor(Color.rgb(238, 238, 238));
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(pixels(context, 10), pixels(context, 5), pixels(context, 10), pixels(context, 5));
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(38, 38, 38));
        background.setCornerRadius(pixels(context, 5));
        button.setBackground(background);
        button.setOnClickListener(view -> { button.clearFocus(); action.onClick(view); });
        return button;
    }

    static void label(TextView view, String value) { if (!value.contentEquals(view.getText())) view.setText(value); }

    static void insets(View view) {
        ViewCompat.setOnApplyWindowInsetsListener(view, (target, windowInsets) -> {
            Insets safe = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            target.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(view);
    }
}

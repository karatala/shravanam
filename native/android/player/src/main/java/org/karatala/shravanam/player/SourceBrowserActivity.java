package org.karatala.shravanam.player;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.os.Message;
import android.text.InputFilter;
import android.text.InputType;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AlertDialog;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;

public final class SourceBrowserActivity extends AppCompatActivity {
    private LinearLayout root;
    private EditText address;
    private TextView status;
    private Button listen;
    private Button watch;
    private Button download;
    private WebView page;
    private PlaybackConnection connection;
    private String currentUrl = "https://m.youtube.com";
    private boolean resumed;
    private boolean handingOff;
    private String downloadUrl;
    private int downloadFormat;
    private final ActivityResultLauncher<String> notifications = this.registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> this.startDownload());

    static void open(Activity activity, String input) {
        String url = SourceBrowserUrl.address(input);
        activity.startActivity(new Intent(activity, SourceBrowserActivity.class).putExtra("address", url).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    private String text(String english, String russian) { return NativeControls.text(this, english, russian); }

    @Override public void onCreate(Bundle savedState) {
        this.setTheme(com.getcapacitor.android.R.style.AppTheme_NoActionBar);
        super.onCreate(savedState);
        this.currentUrl = SourceBrowserUrl.address(savedState == null ? this.getIntent().getStringExtra("address") : savedState.getString("address"));
        this.root = new LinearLayout(this);
        this.root.setOrientation(LinearLayout.VERTICAL);
        this.root.setBackgroundColor(Color.rgb(20, 20, 20));
        LinearLayout navigation = new LinearLayout(this);
        navigation.addView(NativeControls.button(this, "←", view -> this.back()));
        navigation.addView(NativeControls.button(this, "→", view -> { if (this.page != null && this.page.canGoForward()) this.page.goForward(); }));
        navigation.addView(NativeControls.button(this, "↻", view -> { if (this.page != null) this.page.reload(); }));
        this.address = new EditText(this);
        this.address.setSingleLine(true);
        this.address.setTextSize(12);
        this.address.setTextColor(Color.WHITE);
        this.address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        this.address.setImeOptions(EditorInfo.IME_ACTION_GO);
        this.address.setFilters(new InputFilter[] { new InputFilter.LengthFilter(8192) });
        this.address.setHint(text("HTTPS address or YouTube search", "HTTPS-адрес или поиск YouTube"));
        this.address.setOnEditorActionListener((view, action, event) -> { if (action == EditorInfo.IME_ACTION_GO) { this.navigate(); return true; } return false; });
        navigation.addView(this.address, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        navigation.addView(NativeControls.button(this, text("Open", "Открыть"), view -> this.navigate()));
        this.root.addView(navigation);
        LinearLayout actions = new LinearLayout(this);
        this.listen = NativeControls.button(this, text("Listen", "Слушать"), view -> this.handOff(true));
        this.watch = NativeControls.button(this, text("Watch", "Смотреть"), view -> this.handOff(false));
        actions.addView(this.listen);
        actions.addView(this.watch);
        this.download = NativeControls.button(this, text("Download", "Скачать"), view -> this.chooseDownload());
        actions.addView(this.download);
        actions.addView(NativeControls.button(this, text("Close", "Закрыть"), view -> this.finish()));
        this.root.addView(actions);
        this.status = new TextView(this);
        this.status.setTextSize(12);
        this.status.setTextColor(Color.LTGRAY);
        this.status.setText(text("Open one YouTube video, then select Listen, Watch, or Download.", "Откройте ролик YouTube и выберите «Слушать», «Смотреть» или «Скачать»."));
        this.root.addView(this.status);
        this.setContentView(this.root);
        NativeControls.insets(this.root);
        this.getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { SourceBrowserActivity.this.back(); }
        });
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        this.setIntent(intent);
        this.currentUrl = SourceBrowserUrl.address(intent.getStringExtra("address"));
        if (this.page != null) this.page.loadUrl(this.currentUrl);
    }

    @Override protected void onResume() {
        super.onResume();
        this.resumed = true;
        this.handingOff = false;
        if (this.page == null) this.createPage();
    }

    @Override protected void onPause() {
        this.resumed = false;
        this.destroyPage();
        if (this.connection != null) this.connection.close();
        this.connection = null;
        super.onPause();
    }

    @Override protected void onSaveInstanceState(Bundle state) { state.putString("address", this.currentUrl); super.onSaveInstanceState(state); }

    private void createPage() {
        // This is a website view, never a Capacitor view. Do not attach any native JS bridge.
        this.page = new WebView(this);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) WebViewCompat.setProfile(this.page, "ShravanamSources");
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.MUTE_AUDIO)) {
            this.page.destroy();
            this.page = null;
            this.updateActions();
            this.status.setText(text("Update Android System WebView to use the source browser.", "Обновите Android System WebView для встроенного браузера."));
            return;
        }
        WebViewCompat.setAudioMuted(this.page, true);
        WebSettings settings = this.page.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        this.page.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message result) { return false; }
        });
        this.page.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (SourceBrowserUrl.navigable(request.getUrl().toString())) return false;
                if (request.isForMainFrame()) SourceBrowserActivity.this.status.setText(SourceBrowserActivity.this.text("Only HTTPS pages can open here.", "Здесь можно открывать только HTTPS-страницы."));
                return true;
            }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) { SourceBrowserActivity.this.locationChanged(url); }
            @Override public void onPageFinished(WebView view, String url) { SourceBrowserActivity.this.locationChanged(url); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) SourceBrowserActivity.this.pageFailed(); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { if (request.isForMainFrame()) SourceBrowserActivity.this.pageFailed(); }
        });
        this.page.setDownloadListener((url, agent, disposition, type, size) -> this.status.setText(text("Use Download above to save the current YouTube video.", "Для сохранения текущего ролика YouTube нажмите «Скачать» сверху.")));
        this.root.addView(this.page, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        this.address.setText(this.currentUrl);
        this.updateActions();
        this.page.loadUrl(this.currentUrl);
    }

    private void destroyPage() {
        if (this.page == null) return;
        this.root.removeView(this.page);
        this.page.stopLoading();
        this.page.onPause();
        this.page.setWebViewClient(new WebViewClient());
        this.page.setWebChromeClient(null);
        this.page.destroy();
        this.page = null;
    }

    private void locationChanged(String url) {
        if (!this.resumed || !SourceBrowserUrl.navigable(url)) return;
        this.currentUrl = url;
        if (!this.address.hasFocus()) this.address.setText(url);
        this.updateActions();
    }

    private void updateActions() {
        boolean supported;
        try { YouTubeSource.parse(this.currentUrl); supported = true; }
        catch (IllegalArgumentException failure) { supported = false; }
        this.listen.setEnabled(supported && !this.handingOff);
        this.watch.setEnabled(supported && !this.handingOff);
        this.download.setEnabled(supported && !this.handingOff);
    }

    private void chooseDownload() {
        String actual = this.page != null && this.page.getUrl() != null ? this.page.getUrl() : this.currentUrl;
        try { this.downloadUrl = YouTubeSource.parse(actual).url; }
        catch (IllegalArgumentException failure) { this.status.setText(text("Open one recorded YouTube video first.", "Сначала откройте один записанный ролик YouTube.")); return; }
        new AlertDialog.Builder(this).setTitle(text("Save offline", "Сохранить без сети"))
            .setItems(new String[] { text("Audio", "Аудио"), text("Video ≤480p", "Видео ≤480p"), text("Video ≤720p", "Видео ≤720p"), text("Video ≤1080p", "Видео ≤1080p") }, (dialog, which) -> {
                this.downloadFormat = which;
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) this.notifications.launch("android.permission.POST_NOTIFICATIONS");
                else this.startDownload();
            }).setNegativeButton(android.R.string.cancel, null).show();
    }

    private void startDownload() {
        if (this.downloadUrl == null || this.isFinishing()) return;
        try {
            DownloadService.enqueue(this, this.downloadUrl, this.downloadFormat == 0, this.downloadFormat == 1 ? 480 : this.downloadFormat == 3 ? 1080 : 720, null);
            this.status.setText(text("Added to Downloads in the main app. Playback is unchanged.", "Добавлено в «Загрузки» на главной странице. Воспроизведение продолжается."));
        } catch (Exception failure) {
            PlaybackDiagnostics.record("browser.download.failed", "Cannot start selected YouTube transfer", failure);
            this.status.setText(failure instanceof IllegalStateException ? text("Another transfer is running or stopping. Return to Downloads to cancel it or retry.", "Другая загрузка ещё идёт или останавливается. Откройте «Загрузки», чтобы отменить её или повторить попытку.") : text("Cannot start the download. Check free storage and retry from Downloads in the main app.", "Не удалось начать загрузку. Проверьте свободное место и повторите попытку в разделе «Загрузки» на главной странице."));
        }
    }

    private void pageFailed() { this.status.setText(text("Cannot load this page. Check the connection and address, then reload.", "Не удалось загрузить страницу. Проверьте соединение и адрес, затем обновите её.")); }

    private void navigate() {
        try {
            this.currentUrl = SourceBrowserUrl.address(this.address.getText().toString());
            this.address.clearFocus();
            if (this.page == null) this.createPage(); else this.page.loadUrl(this.currentUrl);
        } catch (IllegalArgumentException failure) { this.address.setError(text("Enter an HTTPS address, for example https://m.youtube.com, or a search.", "Введите HTTPS-адрес, например https://m.youtube.com, или поисковый запрос.")); }
    }

    private void back() { if (this.page != null && this.page.canGoBack()) this.page.goBack(); else this.finish(); }

    private void handOff(boolean audioOnly) {
        if (this.handingOff) return;
        String source = this.page != null && this.page.getUrl() != null ? this.page.getUrl() : this.currentUrl;
        try { YouTubeSource.parse(source); }
        catch (IllegalArgumentException failure) { this.status.setText(text("Open one recorded YouTube video first.", "Сначала откройте один записанный ролик YouTube.")); return; }
        this.handingOff = true;
        this.updateActions();
        if (this.connection != null) this.connection.close();
        this.connection = new PlaybackConnection(this, connected -> {
            this.destroyPage();
            JSObject command = new JSObject().put("type", "open-youtube").put("url", source).put("audioOnly", audioOnly);
            connected.command(command);
            NativeVideoActivity.present(this, connected, command);
            this.finish();
        }, () -> {
            this.handingOff = false;
            this.updateActions();
            this.status.setText(text("Cannot connect to the player. Return and reopen the browser.", "Не удалось подключиться к плееру. Вернитесь и откройте браузер снова."));
            if (this.resumed && this.page == null) this.createPage();
        });
    }
}

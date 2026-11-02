package com.phishguard.android;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.Patterns;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.cardview.widget.CardView;

import java.util.regex.Matcher;

public class MainActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "phishguard_prefs";
    private static final String PREF_BACKEND_URL = "backend_url";
    private static final String DEFAULT_BACKEND_URL = "http://10.0.2.2:8009"; // emulator alias for host localhost

    private EditText etUrl;
    private EditText etBackendUrl;
    private Button btnAnalyze;
    private Button btnSaveSettings;
    private ProgressBar progressBar;
    private TextView tvError;
    private CardView resultCard;
    private TextView tvBadge;
    private TextView tvScore;
    private TextView tvHeading;
    private TextView tvDomain;
    private TextView tvReasons;

    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        bindViews();
        etBackendUrl.setText(prefs.getString(PREF_BACKEND_URL, DEFAULT_BACKEND_URL));

        btnSaveSettings.setOnClickListener(v -> saveBackendUrl());
        btnAnalyze.setOnClickListener(v -> analyze(etUrl.getText().toString().trim()));
        findViewById(R.id.btnSetDefaultBrowser).setOnClickListener(v -> openDefaultAppsSettings());

        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void bindViews() {
        etUrl = findViewById(R.id.etUrl);
        etBackendUrl = findViewById(R.id.etBackendUrl);
        btnAnalyze = findViewById(R.id.btnAnalyze);
        btnSaveSettings = findViewById(R.id.btnSaveSettings);
        progressBar = findViewById(R.id.progressBar);
        tvError = findViewById(R.id.tvError);
        resultCard = findViewById(R.id.resultCard);
        tvBadge = findViewById(R.id.tvBadge);
        tvScore = findViewById(R.id.tvScore);
        tvHeading = findViewById(R.id.tvHeading);
        tvDomain = findViewById(R.id.tvDomain);
        tvReasons = findViewById(R.id.tvReasons);
    }

    /**
     * Called when PhishGuard is opened via the Android share sheet — e.g. the
     * user long-presses a link (or the whole message) in Messages/WhatsApp/
     * Gmail and taps Share, then picks PhishGuard. We pull the shared text,
     * extract the first URL in it (a share from Messages is often the full
     * SMS body, not just the bare link), and analyze it immediately.
     */
    private void handleIncomingIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (sharedText == null) return;

        String extractedUrl = extractFirstUrl(sharedText);
        if (extractedUrl != null) {
            etUrl.setText(extractedUrl);
            analyze(extractedUrl);
        } else {
            etUrl.setText(sharedText);
            Toast.makeText(this, "No link found in the shared text — edit and analyze manually.", Toast.LENGTH_LONG).show();
        }
    }

    private String extractFirstUrl(String text) {
        Matcher matcher = Patterns.WEB_URL.matcher(text);
        if (matcher.find()) {
            return text.substring(matcher.start(), matcher.end());
        }
        return null;
    }

    /**
     * Opens the system "Default apps" screen so the user can pick PhishGuard
     * as their default browser — the one manual step that makes automatic
     * link-checking (LinkGateActivity) work. Android does not let apps set
     * this silently; the user has to do it themselves, once, for security
     * reasons. This constant exists from API 24 (our minSdk), but a few
     * OEM Android skins rename or relocate this screen — if it's not
     * available we fall back to the general Settings app with a toast
     * explaining the manual path (Settings → Apps → Default apps → Browser app).
     */
    private void openDefaultAppsSettings() {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this,
                    "Open Settings → Apps → Default apps → Browser app, then choose PhishGuard.",
                    Toast.LENGTH_LONG).show();
            try {
                startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS));
            } catch (Exception ignored) { /* nothing more we can do */ }
        }
    }

    private void saveBackendUrl() {
        String url = etBackendUrl.getText().toString().trim();
        if (url.isEmpty()) {
            Toast.makeText(this, "Enter a backend URL first.", Toast.LENGTH_SHORT).show();
            return;
        }
        prefs.edit().putString(PREF_BACKEND_URL, url).apply();
        Toast.makeText(this, R.string.settings_saved, Toast.LENGTH_SHORT).show();
    }

    private void analyze(String url) {
        hideError();

        if (url == null || url.trim().isEmpty()) {
            showError(getString(R.string.error_empty_url));
            return;
        }

        String backendUrl = prefs.getString(PREF_BACKEND_URL, DEFAULT_BACKEND_URL);
        if (backendUrl == null || backendUrl.trim().isEmpty()) {
            showError(getString(R.string.error_no_backend));
            return;
        }

        setLoading(true);
        resultCard.setVisibility(View.GONE);

        ApiClient.analyze(backendUrl, url.trim(), new ApiClient.Callback() {
            @Override
            public void onSuccess(AnalyzeResult result) {
                setLoading(false);
                showResult(result);
            }

            @Override
            public void onError(String message) {
                setLoading(false);
                showError(message);
            }
        });
    }

    private void showResult(AnalyzeResult result) {
        resultCard.setVisibility(View.VISIBLE);

        int color = colorForLevel(result.level);
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setCornerRadius(999f);
        badgeBg.setColor(color);
        tvBadge.setBackground(badgeBg);
        tvBadge.setText(result.level.toUpperCase());

        tvScore.setText(result.score + "/100");
        tvHeading.setText("This link looks " + result.level);
        tvDomain.setText(result.domain.isEmpty() ? result.url : result.domain);

        StringBuilder reasonsText = new StringBuilder();
        for (String reason : result.reasons) {
            if (reasonsText.length() > 0) reasonsText.append("\n\n");
            reasonsText.append("•  ").append(reason);
        }
        tvReasons.setText(reasonsText.toString());
    }

    private int colorForLevel(String level) {
        switch (level) {
            case "safe": return getColor(R.color.safe);
            case "moderate": return getColor(R.color.moderate);
            case "suspicious": return getColor(R.color.suspicious);
            case "dangerous": return getColor(R.color.dangerous);
            default: return Color.GRAY;
        }
    }

    private void setLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        btnAnalyze.setEnabled(!loading);
        btnAnalyze.setText(loading ? R.string.loading : R.string.btn_analyze);
    }

    private void showError(String message) {
        tvError.setText(message);
        tvError.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        tvError.setVisibility(View.GONE);
    }
}

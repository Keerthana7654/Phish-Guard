package com.phishguard.android;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.cardview.widget.CardView;

import java.util.List;

/**
 * The piece that makes checking automatic instead of a manual share.
 *
 * Once the user sets PhishGuard as their phone's default browser (see
 * MainActivity's "Set as Default Browser" button), Android routes EVERY
 * tapped http/https link — from WhatsApp, SMS, Gmail, etc. — to this
 * activity first, before any real browser opens. We analyze it here and:
 *   - safe: forward straight to a real browser, near-instantly,
 *     with no visible UI at all (see the brief "Checking…" card).
 *   - moderate/suspicious/dangerous: show a warning card with Go Back /
 *     Continue Anyway, exactly like the desktop extension's warning page.
 *
 * Fail-open by design: if the backend can't be reached, this forwards the
 * link anyway rather than trapping the user — the Android app (unlike the
 * extension) has no local heuristic engine to fall back on, so silently
 * blocking all browsing whenever the backend is down would be worse than
 * skipping the check for that one link. See onError() below.
 */
public class LinkGateActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "phishguard_prefs";
    private static final String PREF_BACKEND_URL = "backend_url";
    private static final String DEFAULT_BACKEND_URL = "http://10.0.2.2:8009";

    private static final String[] KNOWN_BROWSER_PACKAGES = {
            "com.android.chrome",
            "org.mozilla.firefox",
            "com.brave.browser",
            "com.microsoft.emmx",
            "com.opera.browser",
            "com.sec.android.app.sbrowser"
    };

    private View loadingSection;
    private CardView warningCard;
    private TextView tvGateDomain;
    private TextView tvBadge;
    private TextView tvScore;
    private TextView tvHeading;
    private TextView tvDomain;
    private TextView tvReasons;

    private String targetUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_link_gate);

        loadingSection = findViewById(R.id.loadingSection);
        warningCard = findViewById(R.id.warningCard);
        tvGateDomain = findViewById(R.id.tvGateDomain);
        tvBadge = findViewById(R.id.tvBadge);
        tvScore = findViewById(R.id.tvScore);
        tvHeading = findViewById(R.id.tvHeading);
        tvDomain = findViewById(R.id.tvDomain);
        tvReasons = findViewById(R.id.tvReasons);

        Uri data = getIntent().getData();
        if (data == null) {
            finish();
            return;
        }
        targetUrl = data.toString();
        tvGateDomain.setText(data.getHost());

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String backendUrl = prefs.getString(PREF_BACKEND_URL, DEFAULT_BACKEND_URL);

        ApiClient.analyze(backendUrl, targetUrl, new ApiClient.Callback() {
            @Override
            public void onSuccess(AnalyzeResult result) {
                if (!"safe".equals(result.level)) {
                    showWarning(result);
                } else {
                    forwardToBrowser(targetUrl);
                }
            }

            @Override
            public void onError(String message) {
                // Fail open — see class doc. A quiet toast, not a dead end.
                Toast.makeText(LinkGateActivity.this,
                        "Couldn't verify this link — opening anyway.", Toast.LENGTH_SHORT).show();
                forwardToBrowser(targetUrl);
            }
        });
    }

    private void showWarning(AnalyzeResult result) {
        loadingSection.setVisibility(View.GONE);
        warningCard.setVisibility(View.VISIBLE);

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

        findViewById(R.id.btnBack).setOnClickListener(v -> finish());
        findViewById(R.id.btnContinue).setOnClickListener(v -> forwardToBrowser(targetUrl));
    }

    private int colorForLevel(String level) {
        switch (level) {
            case "moderate": return getColor(R.color.moderate);
            case "suspicious": return getColor(R.color.suspicious);
            case "dangerous": return getColor(R.color.dangerous);
            default: return getColor(R.color.safe);
        }
    }

    /**
     * Opens the link in a real browser, explicitly avoiding routing back
     * through PhishGuard itself (which would just loop). Tries known
     * browser packages first (works even under Android 11+ package
     * visibility restrictions, since explicitly-named packages are always
     * visible), then falls back to whatever else can handle a VIEW intent.
     */
    private void forwardToBrowser(String url) {
        PackageManager pm = getPackageManager();

        for (String pkg : KNOWN_BROWSER_PACKAGES) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setPackage(pkg);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(pm) != null) {
                startActivity(intent);
                finish();
                return;
            }
        }

        Intent generic = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        generic.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        List<ResolveInfo> resolves = pm.queryIntentActivities(generic, PackageManager.MATCH_DEFAULT_ONLY);
        for (ResolveInfo ri : resolves) {
            if (!ri.activityInfo.packageName.equals(getPackageName())) {
                generic.setPackage(ri.activityInfo.packageName);
                startActivity(generic);
                finish();
                return;
            }
        }

        Toast.makeText(this, "No other browser found to open this link.", Toast.LENGTH_LONG).show();
        finish();
    }
}

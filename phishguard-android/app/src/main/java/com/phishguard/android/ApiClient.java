package com.phishguard.android;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Talks to the exact same PhishGuard backend endpoint the Chrome extension
 * calls (POST {backendUrl}/api/url/analyze). Deliberately dependency-free —
 * java.net.HttpURLConnection + org.json (bundled in Android) is enough for
 * one endpoint, so there's no Retrofit/OkHttp/Gson to add to Gradle.
 */
public class ApiClient {

    public interface Callback {
        void onSuccess(AnalyzeResult result);
        void onError(String message);
    }

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static final int TIMEOUT_MS = 6000;

    public static void analyze(String backendUrl, String targetUrl, Callback callback) {
        EXECUTOR.execute(() -> {
            HttpURLConnection conn = null;
            try {
                String endpoint = backendUrl.replaceAll("/+$", "") + "/api/url/analyze";
                conn = (HttpURLConnection) new URL(endpoint).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                conn.setDoOutput(true);
                conn.setConnectTimeout(TIMEOUT_MS);
                conn.setReadTimeout(TIMEOUT_MS);

                JSONObject body = new JSONObject();
                body.put("url", targetUrl);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int code = conn.getResponseCode();
                InputStream stream = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                String responseBody = readStream(stream);

                if (code >= 200 && code < 300) {
                    AnalyzeResult result = AnalyzeResult.fromJson(new JSONObject(responseBody));
                    postSuccess(callback, result);
                } else {
                    String message = "Server error (" + code + ")";
                    try {
                        JSONObject err = new JSONObject(responseBody);
                        if (err.has("error")) message = err.getString("error");
                    } catch (Exception ignored) { /* fall back to generic message */ }
                    postError(callback, message);
                }
            } catch (IOException e) {
                postError(callback, "Couldn't reach the backend — check the URL and your network connection.");
            } catch (Exception e) {
                postError(callback, "Unexpected error: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private static String readStream(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    private static void postSuccess(Callback callback, AnalyzeResult result) {
        MAIN_HANDLER.post(() -> callback.onSuccess(result));
    }

    private static void postError(Callback callback, String message) {
        MAIN_HANDLER.post(() -> callback.onError(message));
    }
}

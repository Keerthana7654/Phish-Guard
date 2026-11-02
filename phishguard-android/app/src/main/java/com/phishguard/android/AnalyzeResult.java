package com.phishguard.android;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Mirrors the backend's UrlAnalyzeResponse DTO. */
public class AnalyzeResult {

    public final String url;
    public final String domain;
    public final int score;
    public final String level;
    public final List<String> reasons;

    private AnalyzeResult(String url, String domain, int score, String level, List<String> reasons) {
        this.url = url;
        this.domain = domain;
        this.score = score;
        this.level = level;
        this.reasons = reasons;
    }

    public static AnalyzeResult fromJson(JSONObject json) throws JSONException {
        List<String> reasons = new ArrayList<>();
        JSONArray arr = json.optJSONArray("reasons");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                reasons.add(arr.getString(i));
            }
        }
        return new AnalyzeResult(
                json.optString("url", ""),
                json.optString("domain", ""),
                json.optInt("score", 0),
                json.optString("level", "unknown"),
                reasons
        );
    }
}

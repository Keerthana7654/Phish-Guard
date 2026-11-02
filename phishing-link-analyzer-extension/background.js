/**
 * background.js — Manifest V3 service worker (ES module)
 *
 * Responsibilities:
 *  - Own the source of truth for settings, scan history, and whitelist
 *  - AUTOMATICALLY intercept every navigation via chrome.webNavigation
 *    (typed URLs, bookmarks, redirects, clicked links — not just clicks
 *    inside a page) and redirect to warning/warning.html if the score is
 *    high enough. This is what makes blocking automatic — no click on the
 *    extension icon required.
 *  - Route ANALYZE_URL requests: try configured backend first, fall back
 *    to the local heuristic engine (lib/detector.js) automatically
 *  - Maintain a short-lived in-memory cache so hover + click on the same
 *    link doesn't trigger duplicate analysis
 *  - Create the right-click context menu entry
 *  - Fire desktop notifications when a dangerous site is blocked
 */

import "./lib/levenshtein.js";
import "./lib/detector.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  darkMode: false,
  backendUrl: "",       // e.g. "http://localhost:8009" — optional Spring Boot backend
  warnThreshold: 51,    // score >= this shows a warning
  blockThreshold: 76,   // score >= this blocks navigation outright
  backendTimeoutMs: 2500,
};

const MAX_HISTORY = 200;
const analysisCache = new Map(); // url -> { result, expiresAt }
const CACHE_TTL_MS = 60_000;

// Grace-window trust for "Continue Anyway" clicks, keyed by REGISTRABLE
// domain (not exact URL). A single exact-URL bypass isn't enough — real
// sites almost always redirect at least once right after landing (HTTP to
// HTTPS, bare domain to "www.", straight to a login subpage), and each hop
// is a genuinely new navigation that onBeforeNavigate would otherwise
// re-analyze and immediately re-block, making "Continue Anyway" look like
// it does nothing. Scoping to the registrable domain (not the whole
// navigation) means a redirect to a totally different, unrelated domain
// still gets scanned fresh — only hops within the domain the user actually
// approved are covered. Auto-expires so this never becomes a silent
// permanent bypass; that's what the "remember this domain" checkbox is for.
const temporarilyTrustedDomains = new Map(); // registrable domain -> expiry timestamp
const TEMP_TRUST_TTL_MS = 5 * 60 * 1000; // 5 minutes

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["settings"]);
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  const store = await chrome.storage.local.get(["history", "whitelist", "stats"]);
  if (!store.history) await chrome.storage.local.set({ history: [] });
  if (!store.whitelist) await chrome.storage.local.set({ whitelist: [] });
  if (!store.stats) {
    await chrome.storage.local.set({
      stats: { total: 0, safe: 0, moderate: 0, suspicious: 0, dangerous: 0 },
    });
  }

  chrome.contextMenus.create({
    id: "phishguard-analyze-link",
    title: "Analyze this link with PhishGuard",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "phishguard-analyze-link" && info.linkUrl) {
    const result = await analyze(info.linkUrl);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `PhishGuard: ${result.level.toUpperCase()} (${result.score}/100)`,
      message: result.reasons.slice(0, 2).join(" "),
    });
  }
});

/**
 * This is what makes PhishGuard automatic. chrome.webNavigation.onBeforeNavigate
 * fires for EVERY way a tab can navigate to a new page — typing a URL in the
 * address bar, clicking a bookmark, a link click, a JS redirect, opening a
 * new tab — not just links clicked inside a page's content. This is the
 * single source of truth for blocking; content.js only warms the cache.
 *
 * Note on MV3's limits: unlike the deprecated blocking webRequest API, there
 * is no way to synchronously halt a navigation before it starts loading.
 * What this does instead is redirect the tab to the warning page the moment
 * analysis completes — for the local heuristic engine that's near-instant
 * (a few ms), so in practice the dangerous page is swapped out before it
 * finishes rendering. If a remote backend is configured and slow/unreachable,
 * there can be a brief flash of the real page before the fallback redirect
 * lands; the local engine alone has no such gap.
 */
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only top-level navigations, not iframes/ads
  const url = details.url;
  if (!/^https?:\/\//.test(url)) return;
  if (url.startsWith(chrome.runtime.getURL(""))) return; // don't re-scan our own warning page

  const settings = await getSettings();
  if (!settings.enabled) return;

  const hostname = (() => { try { return new URL(url).hostname; } catch { return null; } })();
  if (!hostname) return;
  const registrable = self.PhishGuardDetector.registrableDomain(hostname);

  const { whitelist } = await chrome.storage.local.get(["whitelist"]);
  if ((whitelist || []).includes(registrable)) return; // user permanently trusted this domain

  const tempTrust = temporarilyTrustedDomains.get(registrable);
  if (tempTrust && tempTrust > Date.now()) return; // user recently chose "Continue Anyway" — don't re-warn during this site's own redirect chain

  const result = await analyze(url);
  console.log(`[PhishGuard] ${url} -> ${result.level} (${result.score}/100)`, result.reasons);
  await recordScan(url, result);

  const warnThreshold = settings.warnThreshold ?? 51;
  if (result.score < warnThreshold) return; // safe / moderate — let it load normally

  if (result.score >= (settings.blockThreshold ?? 76)) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "PhishGuard blocked a dangerous site",
      message: `${hostname} scored ${result.score}/100`,
    });
  }

  const token = crypto.randomUUID();
  await chrome.storage.session.set({ [`pending:${token}`]: { url, result } });

  const warningUrl = chrome.runtime.getURL(`warning/warning.html?token=${token}`);
  chrome.tabs.update(details.tabId, { url: warningUrl });
});

async function getSettings() {
  const { settings } = await chrome.storage.local.get(["settings"]);
  return settings || DEFAULT_SETTINGS;
}

async function callBackend(url, settings) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.backendTimeoutMs);
  try {
    const res = await fetch(`${settings.backendUrl.replace(/\/$/, "")}/api/url/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    const data = await res.json();
    return { ...data, source: "backend" };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function analyze(url) {
  const cached = analysisCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const settings = await getSettings();
  let result;

  if (settings.backendUrl) {
    try {
      result = await callBackend(url, settings);
    } catch (e) {
      result = { ...self.PhishGuardDetector.analyzeUrl(url), source: "local-fallback" };
    }
  } else {
    result = { ...self.PhishGuardDetector.analyzeUrl(url), source: "local" };
  }

  analysisCache.set(url, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function recordScan(url, result) {
  const { history, stats } = await chrome.storage.local.get(["history", "stats"]);
  const entry = {
    url,
    domain: result.domain || (() => { try { return new URL(url).hostname; } catch { return url; } })(),
    score: result.score,
    level: result.level,
    reasons: result.reasons,
    timestamp: Date.now(),
  };
  const newHistory = [entry, ...(history || [])].slice(0, MAX_HISTORY);
  const newStats = { ...(stats || { total: 0, safe: 0, moderate: 0, suspicious: 0, dangerous: 0 }) };
  newStats.total += 1;
  newStats[result.level] = (newStats[result.level] || 0) + 1;
  await chrome.storage.local.set({ history: newHistory, stats: newStats });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "ANALYZE_URL": {
        const result = await analyze(message.url);
        sendResponse({ ok: true, result });
        break;
      }
      case "RECORD_SCAN": {
        await recordScan(message.url, message.result);
        sendResponse({ ok: true });
        break;
      }
      case "GET_SETTINGS": {
        sendResponse({ ok: true, settings: await getSettings() });
        break;
      }
      case "SAVE_SETTINGS": {
        await chrome.storage.local.set({ settings: message.settings });
        sendResponse({ ok: true });
        break;
      }
      case "GET_HISTORY": {
        const { history } = await chrome.storage.local.get(["history"]);
        sendResponse({ ok: true, history: history || [] });
        break;
      }
      case "GET_STATS": {
        const { stats } = await chrome.storage.local.get(["stats"]);
        sendResponse({ ok: true, stats });
        break;
      }
      case "CLEAR_HISTORY": {
        await chrome.storage.local.set({ history: [] });
        sendResponse({ ok: true });
        break;
      }
      case "GET_WHITELIST": {
        const { whitelist } = await chrome.storage.local.get(["whitelist"]);
        sendResponse({ ok: true, whitelist: whitelist || [] });
        break;
      }
      case "ADD_WHITELIST": {
        const { whitelist } = await chrome.storage.local.get(["whitelist"]);
        const updated = Array.from(new Set([...(whitelist || []), message.domain]));
        await chrome.storage.local.set({ whitelist: updated });
        sendResponse({ ok: true, whitelist: updated });
        break;
      }
      case "REMOVE_WHITELIST": {
        const { whitelist } = await chrome.storage.local.get(["whitelist"]);
        const updated = (whitelist || []).filter((d) => d !== message.domain);
        await chrome.storage.local.set({ whitelist: updated });
        sendResponse({ ok: true, whitelist: updated });
        break;
      }
      case "GET_PENDING_WARNING": {
        const key = `pending:${message.token}`;
        const stored = await chrome.storage.session.get([key]);
        const data = stored[key];
        if (data) await chrome.storage.session.remove([key]); // one-time use
        sendResponse({ ok: true, data: data || null });
        break;
      }
      case "CONTINUE_TO_URL": {
        const hostname = (() => { try { return new URL(message.url).hostname; } catch { return null; } })();
        const registrable = hostname ? self.PhishGuardDetector.registrableDomain(hostname) : null;
        if (registrable) {
          temporarilyTrustedDomains.set(registrable, Date.now() + TEMP_TRUST_TTL_MS);
          setTimeout(() => temporarilyTrustedDomains.delete(registrable), TEMP_TRUST_TTL_MS);
        }
        if (sender.tab && sender.tab.id != null) {
          chrome.tabs.update(sender.tab.id, { url: message.url });
        }
        sendResponse({ ok: true });
        break;
      }
      case "NOTIFY_BLOCKED": {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "PhishGuard blocked a dangerous site",
          message: `${message.domain} scored ${message.score}/100`,
        });
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();
  return true; // keep the message channel open for the async response
});

# PhishGuard — Real-Time Phishing Link Analyzer (Chrome Extension)

A Manifest V3 Chrome extension that scores every page you navigate to for
phishing risk and automatically redirects to a warning page before it
finishes loading — you never have to click the extension icon for this to
work. Fully self-contained — no backend or build step required to run it.

## How the automatic blocking works

Blocking is driven by `chrome.webNavigation.onBeforeNavigate` in
`background.js`, which fires for **every** way a tab can navigate:

- Typing a URL in the address bar
- Clicking a bookmark
- Clicking a link on a page
- A JS or server-side redirect
- Opening a new tab to a URL

The moment a navigation starts, `background.js` analyzes the destination
and — if the score is at or above the warn threshold — swaps the tab over
to `warning/warning.html`, a full-page interstitial with the score, the
reasons, and "Go Back" / "Continue Anyway" buttons. `content.js` no longer
does the blocking itself; its only job now is warming the analysis cache
when you hover a link, so that when webNavigation fires the redirect is
effectively instant instead of waiting on a fresh analysis.

**Honest limitation**: Manifest V3 has no API to synchronously halt a
navigation before it starts (the old blocking `webRequest` API that could
do this was removed). What happens instead is a same-tab redirect the
instant analysis finishes — for the local heuristic engine that's a few
milliseconds, fast enough that in practice the dangerous page is swapped
out before it finishes rendering. If you configure a slow or unreachable
backend, there can be a brief flash of the real page before the local
fallback kicks in; running local-only has no such gap.

## What's implemented

**Detection engine** (`lib/detector.js`, `lib/levenshtein.js`) — pure JS, no
external API keys needed:
- Typosquat detection (Levenshtein distance vs. 20 top brand domains)
- Punycode / IDN homograph detection (`xn--`)
- Direct-IP URL detection
- Brand-in-subdomain impersonation (e.g. `google.com.fake-domain.xyz`)
- Excessive subdomain depth
- Suspicious keyword matching (login, verify, secure, wallet, etc.)
- Domain entropy / randomness scoring
- HTTPS/protocol check
- URL shortener detection
- Combines into a 0–100 score → **Safe (0–20) / Moderate (21–50) /
  Suspicious (51–75) / Dangerous (76–100)**

**Extension behavior**:
- Every navigation is scored automatically (see above) — no click on a
  link or on the extension icon required
- Dangerous/suspicious destinations redirect to a full-page warning with
  score, reasons, "Go Back," and "Continue Anyway" (with an optional
  "don't warn me again" whitelist)
- Right-click context menu: "Analyze this link with PhishGuard"
- Desktop notification when a dangerous site is blocked
- Popup: current tab's own risk score, running stats (total/safe/
  suspicious/dangerous), last 8 scans, enable/disable toggle, dark mode
- Options page: enable/disable, dark mode, adjustable warn/block thresholds,
  optional backend URL, whitelist management, clear history
- Settings and history persist via `chrome.storage.local`; pending warning
  data is passed through `chrome.storage.session` (one-time use, cleared
  after the warning page reads it)

**Designed for a backend, works without one**: `background.js` already
contains the call path to `POST {backendUrl}/api/url/analyze` — if you set a
Backend URL in Options it will try that first (for WHOIS domain age, Google
Safe Browsing, VirusTotal, AbuseIPDB, etc.) and **automatically fall back**
to the local engine on timeout/error.

## Load it in Chrome (unpacked)

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the `phishing-link-analyzer-extension` folder
5. Type a URL like `http://paypaI-secure-login.tk` directly into the address
   bar and press Enter — you should land on the warning page automatically,
   without clicking any link or the extension icon

No `npm install`, no build step — it's vanilla JS/HTML/CSS so it loads
directly.

## File structure

```
phishing-link-analyzer-extension/
├── manifest.json
├── background.js           # service worker: webNavigation blocking, settings, history, routing
├── content.js               # hover pre-fetch only (cache warming)
├── lib/
│   ├── detector.js           # heuristic scoring engine
│   └── levenshtein.js        # edit-distance util for typosquat detection
├── warning/
│   ├── warning.html / .css / .js   # the auto-shown blocking page
├── popup/
│   ├── popup.html / .css / .js
├── options/
│   ├── options.html / .css / .js
├── icons/
│   ├── icon16.png, icon48.png, icon128.png
└── README.md
```

## Indian banking domain recognition

Two layers, not one:

1. **Architectural rule**: any domain ending in `.bank.in` is trusted
   automatically, without needing to be individually listed. Since October
   2025, India's RBI restricts `.bank.in` registration exclusively to
   RBI-regulated banks (via IDRBT/NIXI) — a phishing operation cannot
   obtain one. This means a bank's dedicated net-banking domain (e.g. Bank
   of Maharashtra's `mahaconnect.bank.in`) is recognized as legitimate even
   though it's never explicitly listed anywhere in this codebase.
2. **Curated list**: banks' legacy `.com`/`.co.in` domains from before the
   migration still need to be individually verified and listed (the
   `.bank.in` rule doesn't cover these). Currently includes all 12 Indian
   public sector banks and the major private banks (HDFC, ICICI, Axis,
   Kotak, IndusInd, Federal, IDFC First), sourced from Wikipedia infoboxes
   and RBI/news coverage of the migration — see `lib/detector.js`'s
   `KNOWN_BRAND_DOMAINS` for the full list and sourcing notes.

This won't catch every regional or cooperative bank's legacy domain — there
are hundreds, and the list here is scoped to the major, most-likely-to-be-
targeted institutions. Once a bank has migrated to `.bank.in`, though, it's
covered automatically regardless of whether it's on this list.

### Legacy bank domains

Banks that have moved to a `.bank.in` address but still own their old
`.com` / `.co.in` domain (e.g. `icicibank.com`) score **moderate** — not
dangerous, because the bank still controls the domain, and not clean,
because it is no longer the bank's official address. The result names the
current `.bank.in` address. Any other Indian bank's name on a non-`.bank.in`
address is flagged too.

## Keeping the extension in sync with the backend

Detection logic lives in two places that must match: `lib/detector.js`
(this extension, used standalone) and `HeuristicDetectors.java` (backend).
When a backend URL is set in Options the extension asks the backend first, so
it gets everything the backend knows. In standalone mode it uses
`detector.js`. The two were checked against each other on the same 37 URLs
and give identical levels and scores. Shortened-link *resolution*
(following a bit.ly to its real destination) exists only on the backend —
browsers hide redirect targets from extensions — so standalone mode can flag
that a link is shortened but cannot see where it goes.

**Scans reach the admin dashboard only when a backend URL is configured.**
Standalone scans stay in the extension's own local history.

## Known limitations (by design — client-only, no backend)

- No WHOIS domain-age lookup, Google Safe Browsing, VirusTotal, PhishTank,
  OpenPhish, or AbuseIPDB unless you configure the backend URL in Options
- SSL certificate detail inspection (issuer, expiry) isn't available to
  extensions in the browser sandbox — needs a backend check
- Redirect-chain crawling isn't done client-side to avoid triggering the
  phishing site itself
- Every top-level navigation is analyzed, including safe/benign sites — if
  you've configured a backend URL, this means a request per page visited,
  not just risky ones. The in-memory cache (60s TTL) avoids re-analyzing
  the exact same URL repeatedly, but browsing many different safe sites
  will still generate one backend call each.

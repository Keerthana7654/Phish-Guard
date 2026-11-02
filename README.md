# PhishGuard — Real-Time Phishing Link Analyzer

Four parts: a Chrome extension that automatically checks every site you
navigate to on desktop (typed URLs, bookmarks, redirects — not just clicked
links), a Spring Boot backend with JWT auth and optional external
threat-intel checks, a React admin/user dashboard, and an Android app that
automatically checks links tapped in WhatsApp/SMS/Gmail — the case Chrome
extensions can't reach at all.

```
phishguard-project/
├── phishing-link-analyzer-extension/   Chrome extension — verified working, light theme
├── phishguard-backend/                 Spring Boot 3 / Java 17 API — verified: full mvn build + tests pass
├── phishguard-frontend/                React + Vite dashboard — verified: builds cleanly, light theme
├── phishguard-android/                 Android (Java) — auto-checks tapped links + manual share — written, not compiled here
└── docs/postman_collection.json        Import into Postman to exercise the API
```

## Honest status of each piece — please read this first

| Piece | Status |
|---|---|
| **Chrome extension** | Syntax-checked every JS file, validated `manifest.json`, loads as an unpacked extension. Blocking is automatic via `chrome.webNavigation` — covers typed URLs, bookmarks, redirects, and clicked links, not just clicks inside a page. |
| **React frontend** | Rebuilt and verified again after the light-theme change — `npm install` + `npm run build` both pass clean, 97 modules, no errors. |
| **Spring Boot backend** | **You've actually built and run this one** — `mvn clean install` passed (35 files compiled, 7 JUnit tests green) and `spring-boot:run` started clean on your machine. This is the most-verified piece in the project at this point. |
| **Android app** | Same situation the backend used to be in: I don't have the Android SDK/Gradle in my sandbox, so I could not compile or run this. Braces balance and XML is well-formed, but that's not the same as a real build. Open it in Android Studio and tell me what breaks. |

## Automatic link checking on Android

The Android app checks links **automatically** when tapped in WhatsApp,
SMS, or Gmail — not just via manual share. This works by registering as a
candidate default browser (the same mechanism Chrome/Firefox use); once you
set PhishGuard as your default browser (one-time, via the in-app button),
every tapped link routes through it first — safe links forward instantly
with no visible screen, suspicious/dangerous ones show a warning card.

**Genuine platform limit, not a bug**: apps that open links in an embedded
in-app browser tab (Instagram, LinkedIn, some Gmail versions) bypass
default-browser selection entirely — no Android permission exists that lets
a third-party app intercept that. WhatsApp and stock Messages/SMS do
respect it, so those are covered. Full details in
`phishguard-android/README.md`.

## How the four pieces connect

1. The extension's `background.js` calls `POST {backendUrl}/api/url/analyze`
   automatically on every navigation — falling back to local detection if
   the backend is unreachable.
2. The same endpoint powers the React dashboard's "Analyze a URL" box.
3. The same endpoint again is what the Android app calls, both when a link
   is auto-intercepted (default-browser flow) and when shared manually —
   this is the piece that covers SMS/WhatsApp phishing.
4. Every scan from any of the three clients lands in the same
   `scan_history` table, so History and the Admin Dashboard show everything
   together regardless of where the scan came from.

## Quickest path to seeing it all work together

```bash
# 1. Backend (zero setup — runs on in-memory H2)
cd phishguard-backend
mvn clean install && mvn spring-boot:run

# 2. Frontend (new terminal)
cd phishguard-frontend
npm install && npm run dev
# → open http://localhost:5173, log in as admin@phishguard.local / ChangeMe123!

# 3. Extension (Chrome)
# chrome://extensions → Developer mode → Load unpacked → select
# phishing-link-analyzer-extension/, then in its Options page set
# Backend base URL to http://localhost:8009

# 4. Android app (Android Studio)
# Open phishguard-android/ as the project root, let Gradle sync, run.
# Tap "Set as Default Browser" in-app, pick PhishGuard.
# On a real phone (not emulator), also set the backend URL in-app to your
# computer's LAN IP, e.g. http://192.168.1.5:8009 — see
# phishguard-android/README.md for why.
```

## What's genuinely out of scope for this pass

Kept out rather than faked: redirect-chain crawling, live SSL cert
inspection, CSV/PDF export, the heatmap/country-analysis view, refresh
tokens, rate limiting, Docker Compose for the frontend, Chrome Web Store
publishing, and Play Store packaging/signing. Each has a note in the
relevant sub-project's README explaining why.

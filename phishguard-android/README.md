# PhishGuard Android (Java)

Two ways to check a link, from most to least automatic:

1. **Tap a link anywhere** (WhatsApp, SMS, Gmail...) → PhishGuard checks it
   automatically before any browser opens. **Requires one manual setup step**
   (below) — Android doesn't let apps claim this silently.
2. **Long-press → Share → PhishGuard** — always works, no setup, but requires
   the extra step per link.

## How the automatic version works (and its real limit)

Android lets an app register as a candidate **default browser** — the same
mechanism Chrome, Firefox, etc. use. `LinkGateActivity` declares an
intent-filter for `VIEW` + `BROWSABLE` on `http`/`https` with no host
restriction, which makes PhishGuard eligible to be selected as your phone's
default browser. Once you do that (one-time, in Settings — tap **"Set as
Default Browser"** on the main screen, or go manually to **Settings → Apps
→ Default apps → Browser app → PhishGuard**), every link tapped in any app
routes into PhishGuard *first*, automatically:

- **Safe/moderate** → forwarded straight to a real browser (Chrome, etc.)
  near-instantly, no visible screen at all
- **Suspicious/dangerous** → a warning card appears with the score, reasons,
  Go Back, and Continue Anyway — same idea as the desktop extension's
  warning page

### What this genuinely cannot cover

Some apps don't use the system's "open in default browser" mechanism at
all — Instagram, LinkedIn, and some versions of Gmail open links in an
**embedded in-app browser tab** (Chrome Custom Tabs or a WebView baked into
the app itself), which bypasses default-browser selection entirely. There
is no Android permission that lets a third-party app intercept that — it's
a platform limitation, not something missing from this build. WhatsApp and
the stock Messages/SMS app do respect default-browser selection as of
current versions, so those are covered.

### Fail-open by design

If the backend is unreachable, `LinkGateActivity` shows a brief "couldn't
verify" toast and opens the link anyway, rather than trapping you on a dead
screen. The Android app has no local heuristic engine to fall back on the
way the Chrome extension does — silently blocking *all* browsing whenever
the backend happens to be down would be worse than skipping one check.

## ⚠️ Please read before you build this

Same situation as the rest of this Android project — I don't have the
Android SDK/Gradle in my sandbox, so I could not compile, run, or test this
new activity, including the default-browser flow, on a real device or
emulator. Every file's braces balance and every XML file is well-formed,
but only you running it in Android Studio is a real verification step. If
`LinkGateActivity` doesn't build or the default-browser picker doesn't
show PhishGuard as an option, send me the exact error/behavior and I'll
fix it directly.

## Setup

1. Open `phishguard-android/` in Android Studio, let Gradle sync, run.
2. On the main screen, tap **"Set as Default Browser"** and pick PhishGuard
   from the system's Default apps → Browser app screen.
3. On a **real phone** (not the emulator), also set the backend URL in the
   app's Settings section to your computer's LAN IP — see the main project
   README for why `10.0.2.2` only works on the emulator.
4. Test by tapping a link in WhatsApp or Messages — it should route through
   PhishGuard automatically now.

## Why cleartext HTTP is allowed

`AndroidManifest.xml` sets `usesCleartextTraffic="true"` because the
backend runs on plain `http://` locally by default. Remove this if you ever
put the backend behind HTTPS for a real deployment.

## What's deliberately not built here

- No local caching/offline mode — every check is a live backend call
- No JWT login flow — calls the public `/api/url/analyze` endpoint only
- Not signed or packaged for Play Store distribution

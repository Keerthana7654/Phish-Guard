/**
 * content.js
 * Injected into every page. Its only job now is to pre-fetch (warm the
 * background's analysis cache for) links the user hovers over, so that
 * when they click and background.js's chrome.webNavigation.onBeforeNavigate
 * listener analyzes the destination, it's already cached and the redirect
 * to the warning page (if needed) is effectively instant.
 *
 * The actual blocking/warning decision does NOT happen here — it happens
 * centrally in background.js via the webNavigation API, because that's the
 * only mechanism that catches every way a page can be opened (typed URL,
 * bookmark, JS redirect, clicked link), not just clicks inside a page.
 * See background.js's onBeforeNavigate listener for the real logic.
 */

(() => {
  const hoverCache = new Set(); // urls already requested this page load
  let enabled = true;
  let hoverTimer = null;

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => resolve(response));
    });
  }

  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
    enabled = res?.settings?.enabled ?? true;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) enabled = changes.settings.newValue?.enabled ?? true;
  });

  function isAnalyzableLink(anchor) {
    if (!anchor || !anchor.href) return false;
    try {
      const u = new URL(anchor.href);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      if (!enabled) return;
      const anchor = e.target.closest && e.target.closest("a[href]");
      if (!isAnalyzableLink(anchor)) return;
      const url = anchor.href;
      if (hoverCache.has(url)) return;
      hoverCache.add(url);

      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        sendMessage({ type: "ANALYZE_URL", url }); // fire-and-forget cache warm
      }, 150);
    },
    true
  );
})();

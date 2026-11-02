function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) {
    document.getElementById("heading").textContent = "Nothing to show";
    return;
  }

  const res = await sendMessage({ type: "GET_PENDING_WARNING", token });
  if (!res?.ok || !res.data) {
    document.getElementById("heading").textContent =
      "This warning has expired. Use your browser's back button.";
    document.getElementById("continueBtn").style.display = "none";
    return;
  }

  const { url, result } = res.data;
  const domain = result.domain || (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  const card = document.getElementById("card");
  card.classList.add(result.level);

  document.getElementById("badge").textContent = result.level.toUpperCase();
  document.getElementById("scoreText").textContent = `${result.score}/100`;
  document.getElementById("heading").textContent = `This link looks ${result.level}`;
  document.getElementById("urlText").textContent = domain;

  const list = document.getElementById("reasonsList");
  list.innerHTML = result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");

  document.getElementById("backBtn").addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  });

  document.getElementById("continueBtn").addEventListener("click", async () => {
    const remember = document.getElementById("rememberCheckbox").checked;
    if (remember) {
      await sendMessage({ type: "ADD_WHITELIST", domain });
    }
    await sendMessage({ type: "RECORD_SCAN", url, result: { ...result, userContinued: true } });
    // Ask background.js to navigate — it marks a one-time bypass for this
    // exact URL BEFORE moving the tab, so its own webNavigation listener
    // doesn't re-analyze this navigation and bounce straight back here.
    await sendMessage({ type: "CONTINUE_TO_URL", url });
  });
}

init();

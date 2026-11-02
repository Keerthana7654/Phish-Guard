function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function applyDarkModePreference() {
  const { settings } = await sendMessage({ type: "GET_SETTINGS" });
  document.body.classList.toggle("dark", !!settings?.darkMode);
  document.getElementById("enabledToggle").checked = !!settings?.enabled;
  return settings;
}

async function loadCurrentSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    document.getElementById("currentDomain").textContent = "No analyzable page";
    document.getElementById("currentLevel").textContent = "";
    return;
  }
  const res = await sendMessage({ type: "ANALYZE_URL", url: tab.url });
  if (!res?.ok) return;
  const { result } = res;
  const ring = document.getElementById("scoreRing");
  ring.textContent = result.score;
  ring.className = `score-ring ${result.level}`;
  document.getElementById("currentDomain").textContent = result.domain || new URL(tab.url).hostname;
  document.getElementById("currentLevel").textContent = `${result.level} risk`;
}

async function loadStats() {
  const { stats } = await sendMessage({ type: "GET_STATS" });
  if (!stats) return;
  document.getElementById("statTotal").textContent = stats.total || 0;
  document.getElementById("statDangerous").textContent = stats.dangerous || 0;
  document.getElementById("statSuspicious").textContent = stats.suspicious || 0;
  document.getElementById("statSafe").textContent = stats.safe || 0;
}

async function loadHistory() {
  const { history } = await sendMessage({ type: "GET_HISTORY" });
  const list = document.getElementById("historyList");
  list.innerHTML = "";
  if (!history || history.length === 0) {
    list.innerHTML = `<li class="history-empty">No scans yet — browse the web and PhishGuard will log link scans here.</li>`;
    return;
  }
  for (const entry of history.slice(0, 8)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="history-domain">${entry.domain}<br><small>${fmtTime(entry.timestamp)}</small></span>
      <span class="history-badge ${entry.level}">${entry.score}</span>
    `;
    list.appendChild(li);
  }
}

async function init() {
  const settings = await applyDarkModePreference();
  await Promise.all([loadCurrentSite(), loadStats(), loadHistory()]);

  document.getElementById("enabledToggle").addEventListener("change", async (e) => {
    const updated = { ...settings, enabled: e.target.checked };
    await sendMessage({ type: "SAVE_SETTINGS", settings: updated });
  });

  document.getElementById("darkModeToggle").addEventListener("click", async () => {
    const isDark = !document.body.classList.contains("dark");
    document.body.classList.toggle("dark", isDark);
    const { settings: current } = await sendMessage({ type: "GET_SETTINGS" });
    await sendMessage({ type: "SAVE_SETTINGS", settings: { ...current, darkMode: isDark } });
  });

  document.getElementById("openOptionsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById("clearHistoryBtn").addEventListener("click", async () => {
    await sendMessage({ type: "CLEAR_HISTORY" });
    loadHistory();
  });
}

init();

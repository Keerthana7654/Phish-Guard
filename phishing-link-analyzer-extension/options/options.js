function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

let currentSettings = null;

async function loadWhitelist() {
  const { whitelist } = await sendMessage({ type: "GET_WHITELIST" });
  const ul = document.getElementById("whitelist");
  ul.innerHTML = "";
  if (!whitelist || whitelist.length === 0) {
    ul.innerHTML = `<li class="chip-empty">No trusted domains yet.</li>`;
    return;
  }
  for (const domain of whitelist) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${domain}</span> <button data-domain="${domain}">✕</button>`;
    li.querySelector("button").addEventListener("click", async (e) => {
      await sendMessage({ type: "REMOVE_WHITELIST", domain: e.target.dataset.domain });
      loadWhitelist();
    });
    ul.appendChild(li);
  }
}

async function load() {
  const { settings } = await sendMessage({ type: "GET_SETTINGS" });
  currentSettings = settings;
  document.body.classList.toggle("dark", !!settings.darkMode);
  document.getElementById("enabled").checked = !!settings.enabled;
  document.getElementById("darkMode").checked = !!settings.darkMode;
  document.getElementById("backendUrl").value = settings.backendUrl || "";
  document.getElementById("warnThreshold").value = settings.warnThreshold ?? 51;
  document.getElementById("blockThreshold").value = settings.blockThreshold ?? 76;
  document.getElementById("warnVal").textContent = settings.warnThreshold ?? 51;
  document.getElementById("blockVal").textContent = settings.blockThreshold ?? 76;
  await loadWhitelist();
}

document.getElementById("warnThreshold").addEventListener("input", (e) => {
  document.getElementById("warnVal").textContent = e.target.value;
});
document.getElementById("blockThreshold").addEventListener("input", (e) => {
  document.getElementById("blockVal").textContent = e.target.value;
});
document.getElementById("darkMode").addEventListener("change", (e) => {
  document.body.classList.toggle("dark", e.target.checked);
});

document.getElementById("save").addEventListener("click", async () => {
  const updated = {
    ...currentSettings,
    enabled: document.getElementById("enabled").checked,
    darkMode: document.getElementById("darkMode").checked,
    backendUrl: document.getElementById("backendUrl").value.trim(),
    warnThreshold: Number(document.getElementById("warnThreshold").value),
    blockThreshold: Number(document.getElementById("blockThreshold").value),
  };
  await sendMessage({ type: "SAVE_SETTINGS", settings: updated });
  currentSettings = updated;
  const msg = document.getElementById("savedMsg");
  msg.textContent = "Saved ✓";
  setTimeout(() => (msg.textContent = ""), 2000);
});

document.getElementById("clearHistory").addEventListener("click", async () => {
  await sendMessage({ type: "CLEAR_HISTORY" });
  const msg = document.getElementById("savedMsg");
  msg.textContent = "History cleared ✓";
  setTimeout(() => (msg.textContent = ""), 2000);
});

load();

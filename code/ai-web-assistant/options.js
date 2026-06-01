// options.js — Settings page logic

const DEFAULT_CONFIG = {
  apiBaseURL: "https://open.bigmodel.cn/api/anthropic",
  apiKey: "",
  model: "glm-5",
  maxTokens: 1024,
};

const inputApiKey = document.getElementById("api-key");
const inputApiBaseURL = document.getElementById("api-base-url");
const inputModel = document.getElementById("model");
const inputMaxTokens = document.getElementById("max-tokens");
const saveBtn = document.getElementById("save-btn");
const toast = document.getElementById("toast");

async function loadConfig() {
  const stored = await chrome.storage.local.get("aiConfig");
  const config = { ...DEFAULT_CONFIG, ...(stored.aiConfig || {}) };

  inputApiKey.value = config.apiKey;
  inputApiBaseURL.value = config.apiBaseURL;
  inputModel.value = config.model;
  inputMaxTokens.value = config.maxTokens;
}

saveBtn.addEventListener("click", async () => {
  const apiKey = inputApiKey.value.trim();
  const apiBaseURL = inputApiBaseURL.value.trim();
  const model = inputModel.value.trim();
  const maxTokens = parseInt(inputMaxTokens.value, 10);

  if (!apiKey) {
    showToast("API Key is required.", "error");
    return;
  }

  await chrome.storage.local.set({
    aiConfig: {
      apiKey,
      apiBaseURL: apiBaseURL || DEFAULT_CONFIG.apiBaseURL,
      model: model || DEFAULT_CONFIG.model,
      maxTokens: maxTokens > 0 ? maxTokens : DEFAULT_CONFIG.maxTokens,
    },
  });

  showToast("Settings saved.", "success");
});

function showToast(message, type) {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, 2500);
}

loadConfig();

import example from "./config.example.js";

let local = null;
try {
  local = (await import("./config.local.js")).default;
} catch {
  console.warn("[config] 未找到 config.local.js，已回退到示例配置；地图无法加载。");
}

const config = { ...example, ...(local || {}) };

const missing = [];
if (!config.jsApiKey || config.jsApiKey.startsWith("请替换")) {
  missing.push("jsApiKey");
}
if (!config.securityCode || config.securityCode.startsWith("请替换")) {
  missing.push("securityCode");
}

if (missing.length > 0) {
  console.warn(`[config] 尚未配置：${missing.join(", ")}。请编辑 config.local.js。`);
}

export default config;

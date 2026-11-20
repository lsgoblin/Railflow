/**
 * 高德 JS API 配置模板。
 *
 * 使用方法：
 *   1. 复制本文件为 config.local.js；
 *   2. 在高德开放平台创建“Web端(JS API)”Key，并配置域名白名单（开发期加 localhost / 127.0.0.1）；
 *   3. 填入 jsApiKey；2021-12-02 之后申请的 Key 还需要填 securityCode；
 *   4. config.local.js 已被 .gitignore 忽略，不要提交。
 *
 * 注意：JS API Key 会出现在浏览器里，不是秘密；真正的保护是域名白名单、配额和 Key 轮换。
 */
export default {
  jsApiKey: "",
  securityCode: "",
  mapVersion: "2.0",
  // 可选：数据模式 "live" | "fixture"；缺省 live。
  // ?dev=1 始终强制 fixture（仅开发检查），优先于这里的设置。
  // dataMode: "live",
  // 同源部署留空；只有跨源部署才需要填写完整 origin。
  apiBase: "",
};

/* 本机草稿：只写 localStorage，不做服务端保存。
 * 草稿是当前行程的快照（城市节点、起始日期），每条带 synthetic: true。
 */

const STORAGE_KEY = "railflow.drafts.v1";

function storageAvailable() {
  try {
    const probe = "__railflow_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readAll() {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function makeTitle(nodes) {
  if (!nodes || nodes.length === 0) return "未命名行程";
  if (nodes.length === 1) return nodes[0].cityName;
  return `${nodes[0].cityName} → ${nodes[nodes.length - 1].cityName}`;
}

function clone(value) {
  return structuredClone(value);
}

export function listDrafts() {
  return readAll()
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((draft) => clone(draft));
}

export function saveDraft(plan) {
  if (!storageAvailable()) {
    return { ok: false, error: { code: "UNKNOWN_ERROR", message: "浏览器本地存储不可用" } };
  }
  const now = new Date().toISOString();
  const existing = readAll();
  const currentId = plan.draftId ?? null;
  const draftId = currentId ?? `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const draft = {
    draftId,
    title: makeTitle(plan.nodes),
    updatedAt: now,
    synthetic: true,
    plan: {
      nodes: clone(plan.nodes ?? []),
      startDate: plan.startDate ?? "",
    },
  };
  const next = [draft, ...existing.filter((item) => item.draftId !== draftId)];
  try {
    writeAll(next.slice(0, 50));
    return { ok: true, draft: clone(draft) };
  } catch {
    return { ok: false, error: { code: "UNKNOWN_ERROR", message: "无法写入浏览器本地存储" } };
  }
}

export function getDraft(draftId) {
  const draft = readAll().find((item) => item.draftId === draftId);
  return draft ? clone(draft) : null;
}

export function removeDraft(draftId) {
  if (!storageAvailable()) return { ok: false, error: { code: "UNKNOWN_ERROR", message: "浏览器本地存储不可用" } };
  try {
    writeAll(readAll().filter((item) => item.draftId !== draftId));
    return { ok: true };
  } catch {
    return { ok: false, error: { code: "UNKNOWN_ERROR", message: "无法更新浏览器本地存储" } };
  }
}

export function clearDrafts() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: { code: "UNKNOWN_ERROR", message: "无法更新浏览器本地存储" } };
  }
}

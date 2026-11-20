/* MVP 面板渲染：直达车次列表、所选车次停站详情、几何状态与数据说明。
 * 只消费 store 的 mvp 片段；列表顺序完全沿用服务端返回，不排序、不截断。
 */

import { el } from "./ui.js";

const GEOMETRY_REASONS = {
  NO_SHAPE: "该车次没有 shape 关联，无法绘制区间轨迹。",
  INVALID_SHAPE: "shape 点不足或坐标非法，无法绘制区间轨迹。",
  INVALID_STATION_COORDINATE: "站点坐标非法，无法匹配区间边界。",
  BOUNDARY_UNRESOLVED: "站点 200 m 内没有匹配点，或站序无法满足，未生成轨迹。",
  BOUNDARY_AMBIGUOUS: "区间边界存在多重匹配，未自动选择，未生成轨迹。",
};

export function renderDatasetSummary(el_, state, api) {
  if (!el_) return;
  const context = state.mvp.context;
  if (context.status === "loading" || context.status === "idle") {
    el_.textContent = "正在读取数据版本…";
    return;
  }
  if (context.status === "error") {
    el_.textContent = context.error?.message ?? "数据版本不可用";
    return;
  }
  const dataset = context.data?.dataset;
  const date = state.mvp.date || context.data?.defaultReferenceServiceDate || "";
  const fixture = context.data?.synthetic ? " · 开发夹具（非真实数据）" : "";
  el_.textContent = `历史回放 · 参考日期 ${date} · 版本 ${dataset?.version ?? "未知"}${fixture}`;
}

export function renderWarnings(el_, state) {
  if (!el_) return;
  const warnings = state.mvp.context.data?.dataset?.warnings ?? [];
  el_.replaceChildren();
  if (!warnings.length) {
    el_.hidden = true;
    return;
  }
  el_.hidden = false;
  const box = el("div", { class: "data-warnings", attrs: { role: "note", "aria-label": "源数据说明" } },
    el("p", { class: "data-warnings-title", text: "源数据说明" }));
  const list = el("ul", { class: "data-warnings-list" });
  for (const warning of warnings) list.append(el("li", { text: warning }));
  box.append(list);
  el_.append(box);
}

export function renderStatus(el_, state, validation) {
  if (!el_) return;
  const trips = state.mvp.trips;
  const context = state.mvp.context;
  el_.replaceChildren();
  el_.dataset.tone = "info";

  if (context.status === "error") {
    el_.dataset.tone = "error";
    el_.append(el("p", { text: context.error?.message ?? "数据版本不可用" }));
    return;
  }
  if (validation && !validation.valid) {
    const first = Object.values(validation.errors)[0];
    if (first) el_.append(el("p", { text: first }));
    return;
  }
  if (trips.status === "loading") {
    el_.append(el("p", { text: "正在查询同车次直达…" }));
    return;
  }
  if (trips.status === "error") {
    el_.dataset.tone = "error";
    el_.append(el("p", { text: trips.error?.message ?? "查询失败" }));
    return;
  }
  if (trips.status === "ready" && trips.items.length) {
    el_.append(el("p", { text: `共 ${trips.items.length} 条同车次直达，按服务端顺序展示。` }));
  }
}

export function renderResults(root, state, actions) {
  if (!root) return;
  root.replaceChildren();
  const trips = state.mvp.trips;
  const context = state.mvp.context;

  if (context.status !== "ready") return;

  if (trips.status === "idle") {
    root.append(el("div", { class: "mvp-empty" },
      el("p", { text: "选择出发站、到达站和参考服务日，查询同车次直达车次。" }),
      el("p", { class: "mvp-hint", text: "本轮只覆盖同一车次直达，不提供换乘、票价或保存。" })));
    return;
  }

  if (trips.status === "loading") {
    root.append(el("p", { class: "mvp-hint", text: "正在查询…" }));
    return;
  }

  if (trips.status === "error") {
    root.append(el("div", { class: "mvp-empty", dataset: { tone: "error" } },
      el("p", { text: trips.error?.message ?? "查询失败" }),
      el("p", { class: "mvp-hint", text: "可修改站点或参考服务日后重试。" }),
      retryButton("重试查询", () => actions.query())));
    return;
  }

  if (trips.status === "ready" && !trips.items.length) {
    const reason = trips.emptyReason;
    const message = reason === "NO_SERVICE_ON_DATE"
      ? "该参考服务日没有开行记录，请更换参考服务日。"
      : "本轮仅支持同车次直达，未找到直达车次，已保留所选站点。";
    root.append(el("div", { class: "mvp-empty" },
      el("p", { text: message }),
      el("p", { class: "mvp-hint", text: `参考服务日 ${state.mvp.date} · 不会自动换日或补换乘。` })));
    return;
  }

  const list = el("ol", { class: "trip-list", attrs: { "aria-label": "同车次直达车次" } });
  for (const item of trips.items) {
    list.append(renderTripCard(item, state, actions));
  }
  root.append(list);

  const selected = trips.items.find((item) => item.tripId === state.mvp.selectedTripId);
  if (selected) root.append(renderTripDetail(selected, state, actions));
}

function renderTripCard(item, state, actions) {
  const selected = item.tripId === state.mvp.selectedTripId;
  const card = el("li", {
    class: "trip-card",
    dataset: { selected: selected ? "true" : "false" },
  });
  const button = el("button", {
    class: "trip-card-button",
    attrs: { type: "button", "aria-pressed": selected ? "true" : "false" },
    on: { click: () => actions.selectTrip(item.tripId) },
  },
  el("span", { class: "trip-card-head" },
    el("span", { class: "trip-train", text: item.trainName }),
    el("span", { class: "trip-id", text: item.tripId })),
  el("span", { class: "trip-route" },
    el("span", { class: "trip-end" },
      el("span", { class: "trip-time", text: shortTime(item.from.departureTime) }),
      el("span", { class: "trip-station", text: item.from.stopName }),
      el("span", { class: "trip-stopid", text: `${item.from.stopId} · seq ${item.from.stopSequence}` })),
    el("span", { class: "trip-arrow", attrs: { "aria-hidden": "true" }, text: "→" }),
    el("span", { class: "trip-end trip-end--right" },
      el("span", { class: "trip-time", text: shortTime(item.to.arrivalTime) }),
      el("span", { class: "trip-station", text: item.to.stopName }),
      el("span", { class: "trip-stopid", text: `${item.to.stopId} · seq ${item.to.stopSequence}` }))),
  el("span", { class: "trip-meta" },
    el("span", { text: `到达 ${formatDateTime(item.to.arrivalDateTime)}` }),
    dayOffsetBadge(item.to.arrivalDayOffset),
    el("span", { text: item.shapeId ? `shape ${item.shapeId}` : "无 shape" })));
  card.append(button);
  return card;
}

function renderTripDetail(item, state, actions) {
  const stops = state.mvp.stops;
  const geometry = state.mvp.geometry;
  const section = el("section", { class: "trip-detail", attrs: { "aria-label": "停站详情" } });
  section.append(el("h2", { class: "detail-title", text: `${item.trainName} 停站与区间` }));
  section.append(el("p", { class: "detail-sub", text:
    `参考服务日 ${state.mvp.date} · ${item.from.stopName}（${item.from.stopId}）seq ${item.boardSequence} → `
    + `${item.to.stopName}（${item.to.stopId}）seq ${item.alightSequence}` }));

  if (stops.status === "loading" || stops.status === "idle") {
    section.append(el("p", { class: "mvp-hint", text: "正在加载全趟停站…" }));
  } else if (stops.status === "error") {
    section.append(el("div", { class: "mvp-empty", dataset: { tone: "error" } },
      el("p", { text: stops.error?.message ?? "停站加载失败" }),
      retryButton("重试停站", () => actions.retryStops())));
  } else if (stops.data) {
    section.append(renderStopsTable(stops.data, item));
  }

  section.append(renderGeometryStatus(geometry, item, actions));
  return section;
}

function renderStopsTable(data, item) {
  const table = el("table", { class: "stops-table" });
  const head = el("thead", {},
    el("tr", {},
      el("th", { attrs: { scope: "col" }, text: "序" }),
      el("th", { attrs: { scope: "col" }, text: "车站 / stop_id" }),
      el("th", { attrs: { scope: "col" }, text: "到达" }),
      el("th", { attrs: { scope: "col" }, text: "发车" }),
      el("th", { attrs: { scope: "col" }, text: "完整日期" })));
  const body = el("tbody");
  for (const stop of data.stops ?? []) {
    const isBoard = stop.stopSequence === item.boardSequence;
    const isAlight = stop.stopSequence === item.alightSequence;
    const row = el("tr", { dataset: { board: isBoard ? "true" : "false", alight: isAlight ? "true" : "false" } },
      el("td", { class: "stops-seq", text: String(stop.stopSequence) }),
      el("td", {},
        el("span", { class: "stops-name", text: stop.stopName }),
        el("span", { class: "stops-id", text: stop.stopId }),
        isBoard ? el("span", { class: "tag tag-primary", text: "上" }) : null,
        isAlight ? el("span", { class: "tag tag-danger", text: "下" }) : null),
      el("td", { class: "stops-time", text: stop.arrivalTime }),
      el("td", { class: "stops-time", text: stop.departureTime }),
      el("td", { class: "stops-date" },
        el("span", { text: formatDateTime(stop.arrivalDateTime) }),
        dayOffsetBadge(stop.arrivalDayOffset)));
    body.append(row);
  }
  table.append(head, body);
  const wrap = el("div", { class: "stops-table-wrap" }, table);
  return wrap;
}

function renderGeometryStatus(geometry, item, actions) {
  const box = el("div", { class: "geometry-status" });
  if (geometry.status === "loading" || geometry.status === "idle") {
    box.append(el("p", { class: "mvp-hint", text: "正在加载区间轨迹…" }));
    return box;
  }
  if (geometry.status === "error") {
    box.dataset.tone = "error";
    box.append(el("p", { text: geometry.error?.message ?? "区间轨迹加载失败" }),
      retryButton("重试轨迹", () => actions.retryGeometry()));
    return box;
  }
  const data = geometry.data;
  if (!data) return box;
  if (data.status === "READY") {
    box.dataset.tone = "ready";
    box.append(el("p", { text: `区间轨迹已加载：${data.points.length} 个点，${data.accuracy === "APPROXIMATE" ? "端点为投影近似" : data.accuracy}。` }));
    box.append(el("p", { class: "mvp-hint", text:
      `起点距离 ${formatMeters(data.fromDistanceMeters)} · 终点距离 ${formatMeters(data.toDistanceMeters)} · 来源：${data.source}` }));
    box.append(el("p", { class: "mvp-hint", text: "轨迹仅覆盖所选区间，未画整趟；READY 只表示源关联与边界匹配，不代表时刻已核验或当前开行。" }));
    return box;
  }
  box.dataset.tone = "unavailable";
  box.append(el("p", { text: `区间轨迹不可用：${GEOMETRY_REASONS[data.reason] ?? data.reason}` }));
  box.append(el("p", { class: "mvp-hint", text: "未补直线、未改画整趟；可更换车次或站对后重试。" }));
  return box;
}

function retryButton(label, onClick) {
  return el("button", {
    class: "button button-secondary",
    attrs: { type: "button" },
    text: label,
    on: { click: onClick },
  });
}

function shortTime(value) {
  if (!value) return "--:--";
  const parts = String(value).split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : String(value);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : String(value);
}

function dayOffsetBadge(offset) {
  const value = Number(offset ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return el("span", { class: "tag tag-warning", text: `+${value} 天` });
}

function formatMeters(value) {
  if (value === null || value === undefined) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)} m` : "—";
}

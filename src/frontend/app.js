/* RailFlow 启动入口（MVP：同车次直达历史回放）。
 *
 * 只做编排：状态转移进 store，数据经 api.js，地图经 map.js 适配器。
 * 启动先读 /api/mvp/context，用 dataset.version 与 defaultReferenceServiceDate 初始化；
 * 页面与 /api 同源，失败如实报错，不静默回退夹具。
 */

import config from "./config.js";
import { createApi } from "./api.js";
import { createStationPicker } from "./mvp-search.js";
import {
  renderDatasetSummary,
  renderResults,
  renderStatus,
  renderWarnings,
} from "./mvp-panel.js";
import { initMapController } from "./map.js";
import { dispatch, getState, subscribe, validateMvpQuery } from "./store.js";
import { el, showToast } from "./ui.js";

const $ = (selector, root = document) => root.querySelector(selector);
const params = new URLSearchParams(location.search);
const devEnabled = params.get("dev") === "1";
const forceMapMode = params.get("map");
const simulateMapFailure = params.get("mapfail") === "1" ? { failNext: true } : null;

const api = createApi();

const app = $("#app");
const datasetSummaryEl = $("#dataset-summary");
const fixtureBadge = $("#fixture-badge");
const resultsEl = $("#mvp-results");
const statusEl = $("#query-status");
const warningsEl = $("#warnings");
const dateInput = $("#service-date");
const queryButton = $("#query-button");
const mapCanvas = $("#map-canvas");
const mapSource = $("#map-source");
const mapStatus = $("#map-status");
const errorEls = {
  from: $("#error-from"),
  to: $("#error-to"),
  date: $("#error-date"),
};

let mapController = null;
let lastMapKey = "";
let lastFitKey = "";

/* ---------- 查询与选择 ---------- */

function datasetVersion(state) {
  return state.mvp.context.data?.dataset?.version ?? "";
}

function selectedTrip(state) {
  return state.mvp.trips.items.find((item) => item.tripId === state.mvp.selectedTripId) ?? null;
}

const actions = {
  async query() {
    const state = getState();
    const validation = validateMvpQuery(state);
    if (!validation.valid) {
      render(state);
      return;
    }
    const requestId = state.mvp.trips.requestId + 1;
    const revision = state.mvp.pairRevision;
    dispatch({ type: "MVP_TRIPS_LOADING", requestId, revision });
    const response = await api.searchTrips({
      datasetVersion: datasetVersion(state),
      fromStopId: state.mvp.from.stopId,
      toStopId: state.mvp.to.stopId,
      referenceServiceDate: state.mvp.date,
    });
    if (!response.ok) {
      dispatch({ type: "MVP_TRIPS_ERROR", requestId, revision, error: response.error });
      return;
    }
    dispatch({
      type: "MVP_TRIPS_READY",
      requestId,
      revision,
      items: response.data?.items ?? [],
      emptyReason: response.data?.emptyReason ?? null,
    });
  },

  async selectTrip(tripId) {
    const state = getState();
    const item = state.mvp.trips.items.find((candidate) => candidate.tripId === tripId);
    dispatch({ type: "MVP_TRIP_SELECT", tripId });
    if (!item) return;
    await Promise.all([loadStops(item), loadGeometry(item)]);
  },

  async retryStops() {
    const item = selectedTrip(getState());
    if (item) await loadStops(item);
  },

  async retryGeometry() {
    const item = selectedTrip(getState());
    if (item) await loadGeometry(item);
  },
};

async function loadStops(item) {
  const state = getState();
  const requestId = state.mvp.stops.requestId + 1;
  const revision = state.mvp.tripRevision;
  dispatch({ type: "MVP_STOPS_LOADING", requestId, tripId: item.tripId, revision });
  const response = await api.loadTripStops({
    datasetVersion: datasetVersion(state),
    tripId: item.tripId,
    referenceServiceDate: state.mvp.date,
  });
  if (!response.ok) {
    dispatch({ type: "MVP_STOPS_ERROR", requestId, tripId: item.tripId, revision, error: response.error });
    return;
  }
  dispatch({ type: "MVP_STOPS_READY", requestId, tripId: item.tripId, revision, data: response.data });
}

async function loadGeometry(item) {
  const state = getState();
  const key = `${item.tripId}:${item.boardSequence}:${item.alightSequence}:${state.mvp.date}`;
  const requestId = state.mvp.geometry.requestId + 1;
  const revision = state.mvp.tripRevision;
  dispatch({ type: "MVP_GEOMETRY_LOADING", requestId, key, revision });
  const response = await api.loadGeometry({
    datasetVersion: datasetVersion(state),
    tripId: item.tripId,
    referenceServiceDate: state.mvp.date,
    fromStopId: item.from.stopId,
    toStopId: item.to.stopId,
    boardSequence: item.boardSequence,
    alightSequence: item.alightSequence,
  });
  if (!response.ok) {
    dispatch({ type: "MVP_GEOMETRY_ERROR", requestId, key, revision, error: response.error });
    return;
  }
  dispatch({ type: "MVP_GEOMETRY_READY", requestId, key, revision, data: response.data });
}

/* ---------- 地图 ---------- */

function buildOverlay(state) {
  const mvp = state.mvp;
  const markers = [];
  if (mvp.from) {
    markers.push({
      kind: "start",
      coord: [mvp.from.longitude, mvp.from.latitude],
      nodeId: "from",
      cityName: mvp.from.stopName,
      stationName: mvp.from.stopId,
    });
  }
  if (mvp.to) {
    markers.push({
      kind: "end",
      coord: [mvp.to.longitude, mvp.to.latitude],
      nodeId: "to",
      cityName: mvp.to.stopName,
      stationName: mvp.to.stopId,
    });
  }
  const geometry = mvp.geometry.data;
  const lines = [];
  if (geometry && geometry.status === "READY" && Array.isArray(geometry.points) && geometry.points.length > 1) {
    lines.push({
      key: mvp.selectedTripId,
      candidateId: mvp.selectedTripId,
      legId: mvp.selectedTripId,
      role: "current",
      points: geometry.points,
      missing: false,
    });
  }
  return {
    synthetic: Boolean(state.mvp.context.data?.synthetic),
    datasetVersion: datasetVersion(state),
    markers,
    lines,
    gaps: [],
    selectedCandidateId: mvp.selectedTripId ?? null,
    nodeCount: markers.length,
  };
}

function computeMapPadding() {
  const panel = $("#workspace-panel");
  const rect = panel?.getBoundingClientRect();
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  if (isMobile) {
    return { top: 84, left: 12, right: 12, bottom: Math.min(260, Math.round(window.innerHeight * 0.42)) };
  }
  const panelVisible = rect && rect.width > 0;
  return {
    left: panelVisible ? Math.round(rect.right) + 24 : 48,
    top: 112,
    right: 88,
    bottom: 64,
  };
}

function renderMap(state) {
  if (!mapController) return;
  const mvp = state.mvp;
  const key = JSON.stringify([
    mvp.context.data?.dataset?.version,
    mvp.from?.stopId,
    mvp.to?.stopId,
    mvp.selectedTripId,
    mvp.geometry.status,
    mvp.geometry.data?.status,
    mvp.geometry.data?.points?.length ?? 0,
    mapController.degraded,
  ]);
  if (key !== lastMapKey) {
    lastMapKey = key;
    mapController.render(buildOverlay(state));
  }
  const fitKey = JSON.stringify([
    mvp.from?.stopId,
    mvp.to?.stopId,
    mvp.selectedTripId,
    mvp.geometry.data?.status,
    mvp.geometry.data?.points?.length ?? 0,
  ]);
  if (fitKey !== lastFitKey && (mvp.from || mvp.to)) {
    lastFitKey = fitKey;
    requestAnimationFrame(() => mapController?.fit(computeMapPadding()));
  }
}

function updateMapSource(state) {
  if (!mapSource) return;
  let base = "底图未加载 · 经纬度等距投影（未接入底图服务）";
  if (mapController?.adapterName === "amap") base = "© 高德地图";
  else if (mapController?.degraded) base = "底图未加载 · 已隐藏轨迹";
  const synthetic = state.mvp.context.data?.synthetic ? " · 开发夹具" : "";
  mapSource.textContent = `${base}${synthetic}`;
}

async function setupMap() {
  mapController = await initMapController({
    container: mapCanvas,
    sourceEl: mapSource,
    noticeEl: mapStatus,
    config,
    forceMode: forceMapMode,
    simulateFailure: simulateMapFailure,
    callbacks: {
      onState({ status, notice }) {
        dispatch({
          type: "MAP_SET_STATE",
          status,
          notice,
          adapter: mapController?.adapterName ?? "offline",
        });
      },
      onMarkerClick(nodeId) {
        const target = nodeId === "to" ? "to" : "from";
        (target === "to" ? toPicker : fromPicker)?.focus();
      },
    },
  });
  updateMapSource(getState());
  lastMapKey = "";
  lastFitKey = "";
  renderMap(getState());
  app.dataset.mapReady = "true";
}

/* ---------- 渲染 ---------- */

function renderFieldErrors(validation) {
  for (const [key, node] of Object.entries(errorEls)) {
    if (!node) continue;
    const message = validation?.errors?.[key] ?? "";
    node.hidden = !message;
    node.textContent = message;
  }
}

function render(state) {
  renderDatasetSummary(datasetSummaryEl, state, api);
  renderWarnings(warningsEl, state);
  const validation = validateMvpQuery(state);
  renderStatus(statusEl, state, validation);
  renderResults(resultsEl, state, actions);
  fromPicker?.render();
  toPicker?.render();

  if (document.activeElement !== dateInput && dateInput.value !== state.mvp.date) {
    dateInput.value = state.mvp.date;
  }
  const dataset = state.mvp.context.data?.dataset;
  dateInput.min = dataset?.coverageStart ?? "";
  dateInput.max = dataset?.coverageEnd ?? "";
  renderFieldErrors(validation);

  queryButton.disabled = !validation.valid
    || state.mvp.context.status !== "ready"
    || state.mvp.trips.status === "loading";

  fixtureBadge.hidden = !api.synthetic;
  app.dataset.apiMode = api.mode;
  renderMap(state);
  updateMapSource(state);
}

/* ---------- 事件 ---------- */

function bindEvents() {
  $("#mvp-form").addEventListener("submit", (event) => {
    event.preventDefault();
    actions.query();
  });

  dateInput.addEventListener("change", () => {
    dispatch({ type: "MVP_DATE_SET", date: dateInput.value });
  });

  for (const button of document.querySelectorAll("[data-map-action]")) {
    button.addEventListener("click", () => {
      const action = button.dataset.mapAction;
      if (action === "fit") mapController?.fit(computeMapPadding());
      if (action === "zoom-in") mapController?.zoomIn();
      if (action === "zoom-out") mapController?.zoomOut();
    });
  }

  window.addEventListener("resize", () => mapController?.resize());
}

/* ---------- 开发入口（?dev=1 仅夹具检查） ---------- */

function renderDevBar() {
  if (!devEnabled) return;
  const root = $("#dev-root");
  root.hidden = false;
  const row = el("div", { class: "dev-row" });
  row.append(el("span", {
    class: "dev-label",
    text: "开发夹具模式（?dev=1）：数据为合成夹具，不代表真实车次、时刻或轨迹。",
  }));
  row.append(el("button", {
    class: "button button-secondary",
    attrs: { type: "button" },
    text: "切换到真实数据",
    on: {
      click: () => {
        const next = new URLSearchParams(location.search);
        next.delete("dev");
        next.delete("scenario");
        location.search = next.toString();
      },
    },
  }));
  root.append(row);
}

/* ---------- 启动 ---------- */

const fromPicker = createStationPicker({
  root: $("#station-from"),
  side: "from",
  label: "出发站",
  placeholder: "搜索站名或 stop_id",
  api,
  dispatch,
  getState,
});

const toPicker = createStationPicker({
  root: $("#station-to"),
  side: "to",
  label: "到达站",
  placeholder: "搜索站名或 stop_id",
  api,
  dispatch,
  getState,
});

subscribe((state) => render(state));
bindEvents();
renderDevBar();

const mapSetup = setupMap();
render(getState());

async function boot() {
  dispatch({ type: "MVP_CONTEXT_LOADING" });
  const response = await api.loadContext();
  if (!response.ok) {
    dispatch({ type: "MVP_CONTEXT_ERROR", error: response.error });
    showToast(response.error?.message ?? "数据版本不可用", { tone: "error" });
    return;
  }
  dispatch({ type: "MVP_CONTEXT_READY", context: response.data });
}

await boot();
app.dataset.booted = "true";

/* 验证深链（只读）：?from=NKH&to=AOH&date=2026-11-16&trip=5l000G717920
 * 走同一套 /api/mvp 接口与同一份 store，不绕过任何校验；仅用于复现与截图。 */
async function applyDeepLink() {
  const fromId = params.get("from");
  const toId = params.get("to");
  if (!fromId || !toId) return;
  const state = getState();
  if (state.mvp.context.status !== "ready") return;
  const version = datasetVersion(state);
  const date = params.get("date");
  if (date) dispatch({ type: "MVP_DATE_SET", date });
  const [fromResponse, toResponse] = await Promise.all([
    api.searchStations({ datasetVersion: version, q: fromId, limit: 20 }),
    api.searchStations({ datasetVersion: version, q: toId, limit: 20 }),
  ]);
  const from = fromResponse.ok
    ? (fromResponse.data?.items ?? []).find((station) => station.stopId === fromId) ?? null
    : null;
  const to = toResponse.ok
    ? (toResponse.data?.items ?? []).find((station) => station.stopId === toId) ?? null
    : null;
  if (from) dispatch({ type: "MVP_STATION_SELECT", side: "from", station: from });
  if (to) dispatch({ type: "MVP_STATION_SELECT", side: "to", station: to });
  if (!from || !to) return;
  await actions.query();
  const tripId = params.get("trip");
  if (tripId) await actions.selectTrip(tripId);
}

await applyDeepLink();
await mapSetup;

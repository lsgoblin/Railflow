/* 单一状态：当前行程、查询条件、方案结果、选中与请求态。
 * 视图通过 dispatch 修改状态；store 不发请求、不操作 DOM、不做铁路业务推导。
 * 迟到响应由 requestId / forRevision 双重校验丢弃，不会覆盖更新的状态。
 */

const listeners = new Set();

export function createInitialState(overrides = {}) {
  return {
    dataset: { status: "idle", data: null, error: null },
    plan: {
      revision: 0,
      nodes: [],
      startDate: "",
      selectedNodeId: null,
      synthetic: true,
      savedRevision: null,
    },
    results: {
      status: "idle",
      requestId: 0,
      forRevision: null,
      queryDate: null,
      items: [],
      selectedId: null,
      emptyReason: null,
      error: null,
      datasetVersion: null,
      showAll: false,
      compareIds: [],
      compareActive: false,
      detailsLegId: null,
    },
    ui: {
      view: "route",
      drawer: "half",
      panelCollapsed: false,
      viewMode: "全国",
      search: { query: "", composing: false, status: "idle", items: [], error: null, activeIndex: -1, localFailed: false },
      map: { status: "loading", notice: null, adapter: "offline" },
      ai: { pending: false, messages: [], lastInput: "", requestId: 0 },
      save: { status: "idle", draftId: null, savedRevision: null, savedAt: null, error: null },
      trips: { status: "idle", items: [], error: null },
      dev: { enabled: false, scenario: "complete" },
    },
    requests: { planning: 0, search: 0, ai: 0, save: 0 },
    mvp: {
      context: { status: "idle", data: null, error: null },
      date: "",
      from: null,
      to: null,
      pairRevision: 0,
      tripRevision: 0,
      stations: {
        from: { query: "", status: "idle", items: [], error: null, requestId: 0 },
        to: { query: "", status: "idle", items: [], error: null, requestId: 0 },
      },
      trips: { status: "idle", requestId: 0, forRevision: null, items: [], emptyReason: null, error: null },
      selectedTripId: null,
      stops: { status: "idle", requestId: 0, forTripId: null, forRevision: null, data: null, error: null },
      geometry: { status: "idle", requestId: 0, forKey: null, forRevision: null, data: null, error: null },
    },
  };
}

let state = createInitialState();

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dispatch(action) {
  if (!action || typeof action.type !== "string") return;
  const next = reduce(state, action);
  if (next === state) return;
  const previous = state;
  state = next;
  for (const listener of [...listeners]) listener(state, previous, action);
}

function pushRequest(state, key) {
  return { ...state.requests, [key]: state.requests[key] + 1 };
}

function markResultsStale(state) {
  const results = state.results;
  if (results.status === "idle") return results;
  if (results.status === "stale") return results;
  return { ...results, status: "stale", error: null };
}

/* MVP：换站对/换日期/换车次时立即清空旧结果，避免界面继续显示上一组选择。 */
function resetMvpResults(mvp) {
  return {
    ...mvp,
    trips: {
      status: "idle",
      requestId: mvp.trips.requestId,
      forRevision: null,
      items: [],
      emptyReason: null,
      error: null,
    },
    selectedTripId: null,
    stops: {
      status: "idle",
      requestId: mvp.stops.requestId,
      forTripId: null,
      forRevision: null,
      data: null,
      error: null,
    },
    geometry: {
      status: "idle",
      requestId: mvp.geometry.requestId,
      forKey: null,
      forRevision: null,
      data: null,
      error: null,
    },
  };
}

function updatePlan(state, patch) {
  const plan = { ...state.plan, ...patch, revision: state.plan.revision + 1 };
  const results = markResultsStale(state);
  return {
    ...state,
    plan,
    results,
    ui: { ...state.ui, save: { ...state.ui.save, status: pickSaveStatus(state, plan) } },
  };
}

function pickSaveStatus(state, plan) {
  const save = state.ui.save;
  if (save.status === "saving") return save;
  if (save.savedRevision !== null && save.savedRevision === plan.revision) return save;
  if (save.savedRevision !== null) return { ...save, status: "dirty" };
  return save;
}

function planNode(state, nodeId) {
  return state.plan.nodes.find((node) => node.nodeId === nodeId) ?? null;
}

function reduce(current, action) {
  switch (action.type) {
    case "DATASET_LOADING":
      return { ...current, dataset: { ...current.dataset, status: "loading" } };

    case "DATASET_READY":
      return { ...current, dataset: { status: "ready", data: action.dataset, error: null } };

    case "DATASET_ERROR":
      return { ...current, dataset: { status: "error", data: null, error: action.error } };

    /* ---------- 搜索 ---------- */

    case "SEARCH_SET_QUERY": {
      const search = current.ui.search;
      const next = {
        ...search,
        query: action.query,
        status: action.query ? "typing" : "idle",
        items: [],
        error: null,
        activeIndex: -1,
      };
      return {
        ...current,
        ui: { ...current.ui, search: next },
        requests: { ...current.requests, search: current.requests.search + 1 },
      };
    }

    case "SEARCH_SET_COMPOSING": {
      return { ...current, ui: { ...current.ui, search: { ...current.ui.search, composing: action.composing } } };
    }

    case "SEARCH_LOADING": {
      const next = { ...current.ui.search, status: "loading", error: null };
      return {
        ...current,
        ui: { ...current.ui, search: next },
        requests: { ...current.requests, search: action.requestId },
      };
    }

    case "SEARCH_READY": {
      const search = current.ui.search;
      if (action.requestId !== current.requests.search) return current;
      if (action.query !== search.query) return current;
      const items = action.items ?? [];
      const next = {
        ...search,
        status: items.length ? "ready" : "empty",
        items,
        error: action.localFailed ? { code: "UNKNOWN_ERROR", message: "本地数据载入失败" } : null,
        activeIndex: items.length ? 0 : -1,
      };
      return { ...current, ui: { ...current.ui, search: next } };
    }

    case "SEARCH_ERROR": {
      if (action.requestId !== current.requests.search) return current;
      const search = { ...current.ui.search, status: "error", items: [], error: action.error, activeIndex: -1 };
      return { ...current, ui: { ...current.ui, search } };
    }

    case "SEARCH_CLEAR": {
      return {
        ...current,
        ui: {
          ...current.ui,
          search: { query: "", composing: false, status: "idle", items: [], error: null, activeIndex: -1, localFailed: false },
        },
        requests: { ...current.requests, search: current.requests.search + 1 },
      };
    }

    case "SEARCH_SET_ACTIVE": {
      return { ...current, ui: { ...current.ui, search: { ...current.ui.search, activeIndex: action.index } } };
    }

    /* ---------- 行程编辑 ---------- */

    case "PLAN_REPLACE": {
      const plan = {
        revision: current.plan.revision + 1,
        nodes: action.plan?.nodes ?? [],
        startDate: action.plan?.startDate ?? "",
        selectedNodeId: null,
        synthetic: true,
        savedRevision: action.savedRevision ?? null,
      };
      return {
        ...current,
        plan,
        results: createInitialState().results,
        ui: {
          ...current.ui,
          save: action.savedRevision
            ? { status: "saved", draftId: action.draftId ?? null, savedRevision: action.savedRevision, savedAt: action.savedAt ?? null, error: null }
            : { status: "idle", draftId: null, savedRevision: null, savedAt: null, error: null },
          trips: current.ui.trips,
        },
      };
    }

    case "PLAN_ADD_NODE": {
      if (!action.node) return current;
      return updatePlan(current, { nodes: [...current.plan.nodes, action.node] });
    }

    case "PLAN_REMOVE_NODE": {
      const nodes = current.plan.nodes.filter((node) => node.nodeId !== action.nodeId);
      if (nodes.length === current.plan.nodes.length) return current;
      return updatePlan(current, {
        nodes,
        selectedNodeId: current.plan.selectedNodeId === action.nodeId ? null : current.plan.selectedNodeId,
      });
    }

    case "PLAN_MOVE_NODE": {
      const index = current.plan.nodes.findIndex((node) => node.nodeId === action.nodeId);
      if (index < 0) return current;
      const target = action.direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.plan.nodes.length) return current;
      const nodes = [...current.plan.nodes];
      [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
      return updatePlan(current, { nodes });
    }

    case "PLAN_SELECT_NODE": {
      return { ...current, plan: { ...current.plan, selectedNodeId: action.nodeId } };
    }

    case "PLAN_UPDATE_NODE": {
      const node = planNode(current, action.nodeId);
      if (!node) return current;
      const nodes = current.plan.nodes.map((item) =>
        item.nodeId === action.nodeId ? { ...item, ...action.patch } : item
      );
      return updatePlan(current, { nodes });
    }

    case "PLAN_SET_DATE": {
      return updatePlan(current, { startDate: action.date });
    }

    /* ---------- 查询结果 ---------- */

    case "RESULTS_LOADING": {
      return {
        ...current,
        results: {
          ...current.results,
          status: "loading",
          requestId: action.requestId,
          forRevision: action.forRevision,
          queryDate: action.queryDate ?? null,
          datasetVersion: action.datasetVersion ?? current.results.datasetVersion,
          error: null,
          emptyReason: null,
        },
        requests: { ...current.requests, planning: action.requestId },
      };
    }

    case "RESULTS_READY": {
      if (!resultsActionValid(current, action)) return current;
      return {
        ...current,
        results: {
          ...current.results,
          status: "ready",
          items: action.items ?? [],
          selectedId: action.selectedId ?? action.items?.[0]?.candidateId ?? null,
          emptyReason: null,
          error: null,
          datasetVersion: action.datasetVersion ?? current.results.datasetVersion,
          detailsLegId: null,
          compareIds: [],
          compareActive: false,
        },
      };
    }

    case "RESULTS_EMPTY": {
      if (!resultsActionValid(current, action)) return current;
      return {
        ...current,
        results: {
          ...current.results,
          status: "empty",
          items: [],
          selectedId: null,
          emptyReason: action.reason ?? null,
          error: null,
          detailsLegId: null,
          compareIds: [],
          compareActive: false,
        },
      };
    }

    case "RESULTS_ERROR": {
      if (!resultsActionValid(current, action)) return current;
      return {
        ...current,
        results: {
          ...current.results,
          status: "error",
          items: [],
          selectedId: null,
          error: action.error,
          emptyReason: null,
          detailsLegId: null,
          compareIds: [],
          compareActive: false,
        },
      };
    }

    case "RESULTS_STALE": {
      return { ...current, results: markResultsStale(current) };
    }

    case "RESULTS_RESET": {
      return { ...current, results: createInitialState().results };
    }

    case "SELECT_CANDIDATE": {
      if (current.results.selectedId === action.candidateId) {
        return { ...current, results: { ...current.results, selectedId: null, detailsLegId: null } };
      }
      return {
        ...current,
        results: { ...current.results, selectedId: action.candidateId, detailsLegId: null },
      };
    }

    case "SELECT_LEG_DETAIL": {
      const id = current.results.detailsLegId === action.legId ? null : action.legId;
      return { ...current, results: { ...current.results, detailsLegId: id } };
    }

    case "TOGGLE_COMPARE": {
      const ids = current.results.compareIds;
      const exists = ids.includes(action.candidateId);
      const nextIds = exists ? ids.filter((id) => id !== action.candidateId) : [...ids, action.candidateId].slice(-3);
      return { ...current, results: { ...current.results, compareIds: nextIds } };
    }

    case "SET_COMPARE_ACTIVE": {
      return { ...current, results: { ...current.results, compareActive: Boolean(action.active) } };
    }

    case "SET_SHOW_ALL": {
      return { ...current, results: { ...current.results, showAll: Boolean(action.showAll) } };
    }

    /* ---------- 界面 ---------- */

    case "UI_SET_VIEW":
      return { ...current, ui: { ...current.ui, view: action.view } };

    case "UI_SET_DRAWER":
      return { ...current, ui: { ...current.ui, drawer: action.drawer } };

    case "UI_SET_PANEL_COLLAPSED":
      return { ...current, ui: { ...current.ui, panelCollapsed: Boolean(action.collapsed) } };

    case "UI_SET_VIEW_MODE":
      return { ...current, ui: { ...current.ui, viewMode: action.mode } };

    case "MAP_SET_STATE":
      return { ...current, ui: { ...current.ui, map: { status: action.status, notice: action.notice ?? null, adapter: action.adapter ?? current.ui.map.adapter } } };

    /* ---------- AI ---------- */

    case "AI_SUBMIT": {
      const messages = [
        ...current.ui.ai.messages,
        {
          messageId: action.messageId,
          requestId: action.requestId,
          role: "user",
          text: action.text,
          status: "complete",
          synthetic: true,
        },
      ];
      return {
        ...current,
        ui: { ...current.ui, ai: { ...current.ui.ai, pending: true, messages, lastInput: "", requestId: action.requestId } },
        requests: { ...current.requests, ai: action.requestId },
      };
    }

    case "AI_FAILED": {
      if (action.requestId !== current.ui.ai.requestId) return current;
      const messages = current.ui.ai.messages.map((message) =>
        message.requestId === action.requestId && message.role === "assistant"
          ? { ...message, status: "failed", error: action.error }
          : message
      );
      const hasAssistant = messages.some((message) => message.requestId === action.requestId && message.role === "assistant");
      if (!hasAssistant) {
        messages.push({
          messageId: `ai-${action.requestId}-assistant`,
          requestId: action.requestId,
          role: "assistant",
          text: "",
          status: "failed",
          error: action.error,
          synthetic: true,
        });
      }
      return { ...current, ui: { ...current.ui, ai: { ...current.ui.ai, pending: false, messages } } };
    }

    case "AI_SUCCESS": {
      if (action.requestId !== current.ui.ai.requestId) return current;
      const messages = current.ui.ai.messages.filter(
        (message) => !(message.requestId === action.requestId && message.role === "assistant")
      );
      messages.push({
        messageId: `ai-${action.requestId}-assistant`,
        requestId: action.requestId,
        role: "assistant",
        text: action.text ?? "",
        status: "complete",
        synthetic: Boolean(action.synthetic),
      });
      return { ...current, ui: { ...current.ui, ai: { ...current.ui.ai, pending: false, messages } } };
    }

    case "AI_RETRY": {
      const ai = current.ui.ai;
      const messages = ai.messages.filter(
        (message) => !(message.requestId === action.previousRequestId && message.role === "assistant")
      );
      return {
        ...current,
        ui: { ...current.ui, ai: { ...ai, pending: true, messages, requestId: action.requestId, lastInput: action.text ?? ai.lastInput } },
        requests: { ...current.requests, ai: action.requestId },
      };
    }

    case "AI_CLEAR_ERROR": {
      const messages = current.ui.ai.messages.map((message) =>
        message.role === "assistant" && message.status === "failed" ? { ...message, error: null, status: "complete" } : message
      );
      return { ...current, ui: { ...current.ui, ai: { ...current.ui.ai, messages } } };
    }

    /* ---------- 保存到本机 ---------- */

    case "SAVE_REQUEST":
      return {
        ...current,
        ui: { ...current.ui, save: { ...current.ui.save, status: "saving", error: null } },
        requests: { ...current.requests, save: action.requestId },
      };

    case "SAVE_SUCCESS": {
      if (action.requestId !== current.requests.save) return current;
      const savedCurrent = action.revision === current.plan.revision;
      return {
        ...current,
        plan: { ...current.plan, savedRevision: action.revision },
        ui: {
          ...current.ui,
          save: {
            status: savedCurrent ? "saved" : "dirty",
            draftId: action.draftId,
            savedRevision: action.revision,
            savedAt: action.savedAt,
            error: null,
          },
        },
      };
    }

    case "SAVE_ERROR": {
      if (action.requestId !== current.requests.save) return current;
      return {
        ...current,
        ui: { ...current.ui, save: { ...current.ui.save, status: "error", error: action.error } },
      };
    }

    case "TRIPS_LOADING":
      return { ...current, ui: { ...current.ui, trips: { ...current.ui.trips, status: "loading", error: null } } };

    case "TRIPS_LOADED":
      return { ...current, ui: { ...current.ui, trips: { status: "ready", items: action.items ?? [], error: null } } };

    case "TRIPS_ERROR":
      return { ...current, ui: { ...current.ui, trips: { ...current.ui.trips, status: "error", error: action.error } } };

    case "DEV_SET_SCENARIO":
      return { ...current, ui: { ...current.ui, dev: { ...current.ui.dev, scenario: action.scenario } } };

    case "DEV_SET_ENABLED":
      return { ...current, ui: { ...current.ui, dev: { ...current.ui.dev, enabled: Boolean(action.enabled) } } };

    /* ---------- MVP：上下文 / 选站 / 直达查询 / 停站 / 几何 ---------- */

    case "MVP_CONTEXT_LOADING":
      return {
        ...current,
        mvp: { ...current.mvp, context: { ...current.mvp.context, status: "loading", error: null } },
      };

    case "MVP_CONTEXT_READY": {
      const context = action.context ?? null;
      const date = current.mvp.date || context?.defaultReferenceServiceDate || "";
      return {
        ...current,
        mvp: {
          ...current.mvp,
          context: { status: "ready", data: context, error: null },
          date,
        },
      };
    }

    case "MVP_CONTEXT_ERROR":
      return {
        ...current,
        mvp: { ...current.mvp, context: { status: "error", data: null, error: action.error } },
      };

    case "MVP_DATE_SET": {
      if (action.date === current.mvp.date) return current;
      return {
        ...current,
        mvp: { ...resetMvpResults(current.mvp), date: action.date, pairRevision: current.mvp.pairRevision + 1 },
      };
    }

    case "MVP_STATION_QUERY": {
      const side = action.side === "to" ? "to" : "from";
      const station = current.mvp.stations[side];
      return {
        ...current,
        mvp: {
          ...current.mvp,
          stations: {
            ...current.mvp.stations,
            [side]: {
              ...station,
              query: action.query,
              status: action.query.trim() ? "typing" : "idle",
              items: [],
              error: null,
              requestId: action.requestId ?? station.requestId,
            },
          },
        },
      };
    }

    case "MVP_STATION_LOADING": {
      const side = action.side === "to" ? "to" : "from";
      return {
        ...current,
        mvp: {
          ...current.mvp,
          stations: {
            ...current.mvp.stations,
            [side]: { ...current.mvp.stations[side], status: "loading", error: null, requestId: action.requestId },
          },
        },
      };
    }

    case "MVP_STATION_RESULTS": {
      const side = action.side === "to" ? "to" : "from";
      const station = current.mvp.stations[side];
      if (action.requestId !== station.requestId) return current;
      if (action.query !== station.query) return current;
      const items = action.items ?? [];
      return {
        ...current,
        mvp: {
          ...current.mvp,
          stations: {
            ...current.mvp.stations,
            [side]: { ...station, status: items.length ? "ready" : "empty", items, error: null },
          },
        },
      };
    }

    case "MVP_STATION_ERROR": {
      const side = action.side === "to" ? "to" : "from";
      const station = current.mvp.stations[side];
      if (action.requestId !== station.requestId) return current;
      return {
        ...current,
        mvp: {
          ...current.mvp,
          stations: {
            ...current.mvp.stations,
            [side]: { ...station, status: "error", items: [], error: action.error },
          },
        },
      };
    }

    case "MVP_STATION_SELECT": {
      const side = action.side === "to" ? "to" : "from";
      if (!action.station) return current;
      return {
        ...current,
        mvp: {
          ...resetMvpResults(current.mvp),
          [side]: action.station,
          pairRevision: current.mvp.pairRevision + 1,
        },
      };
    }

    case "MVP_STATION_CLEAR": {
      const side = action.side === "to" ? "to" : "from";
      return {
        ...current,
        mvp: {
          ...resetMvpResults(current.mvp),
          [side]: null,
          pairRevision: current.mvp.pairRevision + 1,
        },
      };
    }

    case "MVP_TRIPS_LOADING":
      return {
        ...current,
        mvp: {
          ...current.mvp,
          trips: {
            status: "loading",
            requestId: action.requestId,
            forRevision: action.revision,
            items: [],
            emptyReason: null,
            error: null,
          },
          selectedTripId: null,
          stops: createInitialState().mvp.stops,
          geometry: createInitialState().mvp.geometry,
        },
      };

    case "MVP_TRIPS_READY": {
      const trips = current.mvp.trips;
      if (action.requestId !== trips.requestId) return current;
      if (action.revision !== current.mvp.pairRevision) return current;
      return {
        ...current,
        mvp: {
          ...current.mvp,
          trips: {
            ...trips,
            status: "ready",
            items: action.items ?? [],
            emptyReason: action.emptyReason ?? null,
            error: null,
          },
        },
      };
    }

    case "MVP_TRIPS_ERROR": {
      const trips = current.mvp.trips;
      if (action.requestId !== trips.requestId) return current;
      if (action.revision !== current.mvp.pairRevision) return current;
      return {
        ...current,
        mvp: {
          ...current.mvp,
          trips: { ...trips, status: "error", items: [], emptyReason: null, error: action.error },
        },
      };
    }

    case "MVP_TRIP_SELECT": {
      if (action.tripId === current.mvp.selectedTripId) return current;
      return {
        ...current,
        mvp: {
          ...current.mvp,
          selectedTripId: action.tripId,
          tripRevision: current.mvp.tripRevision + 1,
          stops: createInitialState().mvp.stops,
          geometry: createInitialState().mvp.geometry,
        },
      };
    }

    case "MVP_STOPS_LOADING":
      return {
        ...current,
        mvp: {
          ...current.mvp,
          stops: {
            status: "loading",
            requestId: action.requestId,
            forTripId: action.tripId,
            forRevision: action.revision,
            data: null,
            error: null,
          },
        },
      };

    case "MVP_STOPS_READY": {
      const stops = current.mvp.stops;
      if (action.requestId !== stops.requestId) return current;
      if (action.tripId !== current.mvp.selectedTripId) return current;
      if (action.revision !== current.mvp.tripRevision) return current;
      return {
        ...current,
        mvp: { ...current.mvp, stops: { ...stops, status: "ready", data: action.data, error: null } },
      };
    }

    case "MVP_STOPS_ERROR": {
      const stops = current.mvp.stops;
      if (action.requestId !== stops.requestId) return current;
      if (action.tripId !== current.mvp.selectedTripId) return current;
      if (action.revision !== current.mvp.tripRevision) return current;
      return {
        ...current,
        mvp: { ...current.mvp, stops: { ...stops, status: "error", data: null, error: action.error } },
      };
    }

    case "MVP_GEOMETRY_LOADING":
      return {
        ...current,
        mvp: {
          ...current.mvp,
          geometry: {
            status: "loading",
            requestId: action.requestId,
            forKey: action.key,
            forRevision: action.revision,
            data: null,
            error: null,
          },
        },
      };

    case "MVP_GEOMETRY_READY": {
      const geometry = current.mvp.geometry;
      if (action.requestId !== geometry.requestId) return current;
      if (action.key !== geometry.forKey) return current;
      if (action.revision !== current.mvp.tripRevision) return current;
      return {
        ...current,
        mvp: { ...current.mvp, geometry: { ...geometry, status: "ready", data: action.data, error: null } },
      };
    }

    case "MVP_GEOMETRY_ERROR": {
      const geometry = current.mvp.geometry;
      if (action.requestId !== geometry.requestId) return current;
      if (action.key !== geometry.forKey) return current;
      if (action.revision !== current.mvp.tripRevision) return current;
      return {
        ...current,
        mvp: { ...current.mvp, geometry: { ...geometry, status: "error", data: null, error: action.error } },
      };
    }

    default:
      return current;
  }
}

function resultsActionValid(current, action) {
  if (action.requestId !== current.results.requestId) return false;
  if (action.forRevision !== current.plan.revision) return false;
  if (current.results.forRevision !== action.forRevision) return false;
  return true;
}

/* 校验：只判断“能不能发查询”，不替代服务端的历史时刻/衔接/排序规则。 */
export function validatePlan(plan, dataset) {
  const errors = {};
  if (!plan.nodes || plan.nodes.length < 2) {
    errors.nodes = "至少需要两个城市";
  }
  if (!plan.startDate) {
    errors.startDate = "请选择日期";
  } else if (dataset?.dateRange) {
    if (plan.startDate < dataset.dateRange.min || plan.startDate > dataset.dateRange.max) {
      errors.startDate = "日期不在数据范围内";
    }
  }
  for (const node of plan.nodes ?? []) {
    if (node.nodeId === plan.nodes[0]?.nodeId || node.nodeId === plan.nodes[plan.nodes.length - 1]?.nodeId) continue;
    const stay = node.stayDays;
    if (!Number.isInteger(stay) || stay < 1) {
      errors[node.nodeId] = "停留天数需为正整数";
    }
  }
  const stationMissing = plan.nodes?.some(
    (node) => !node.stationId || !node.stationName || node.stationName === "待匹配"
  );
  if (stationMissing) errors.station = "请选择车站";
  return { valid: Object.keys(errors).length === 0, errors };
}

/* MVP 查询前的最小本地校验；日期范围与开行日历仍以服务端为准。 */
export function validateMvpQuery(state) {
  const mvp = state.mvp ?? {};
  const errors = {};
  if (!mvp.from) errors.from = "请选择出发站";
  if (!mvp.to) errors.to = "请选择到达站";
  if (mvp.from && mvp.to && mvp.from.stopId === mvp.to.stopId) {
    errors.to = "出发站与到达站不能相同";
  }
  if (!mvp.date) {
    errors.date = "请选择参考服务日";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(mvp.date)) {
    errors.date = "参考服务日格式应为 YYYY-MM-DD";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

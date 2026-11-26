/* 数据访问层：页面所有数据都经这里获取，组件不直接 fetch。
 *
 * 数据模式是显式开关，不再用“apiBase 是否为空”推断：
 *   - 默认 live：同源请求 /api/mvp/**，失败如实返回错误，绝不静默回退夹具；
 *   - ?dev=1（或 config.dataMode="fixture"）：仅用于开发检查的合成夹具，页面必须标注。
 *
 * 错误统一归一化为 {code, message}：优先使用服务端 {"error":{"code","message"}}，
 * 网络/超时使用本地文案；不输出堆栈、连接串或 SQL。
 */

import config from "./config.js";
import {
  DATASET,
  SCENARIOS,
  candidatesForScenario,
  searchLocalPlaces,
} from "./fixtures.js";

export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "账号或密码错误",
  AUTH_REQUIRED: "请登录",
  FORBIDDEN: "无法访问此内容",
  NOT_FOUND: "内容不存在或不可访问",
  PLAN_VERSION_CONFLICT: "行程已在其他窗口更新",
  VALIDATION_FAILED: "请求参数不完整或格式不正确",
  UPSTREAM_QUOTA: "地点服务暂不可用",
  PLACE_SEARCH_NOT_CONFIGURED: "普通地点搜索尚未配置",
  PLACE_SEARCH_PERMISSION_DENIED: "高德地点查询权限不足",
  PLACE_SEARCH_QUOTA_EXCEEDED: "高德地点查询额度已用尽或受限",
  PLACE_SEARCH_RATE_LIMITED: "地点搜索过于频繁，请稍后重试",
  PLACE_SEARCH_TIMEOUT: "高德地点查询超时，请重试",
  PLACE_SEARCH_UNAVAILABLE: "高德地点搜索暂不可用",
  NETWORK_OFFLINE: "网络不可用，请检查本地服务是否已启动",
  REQUEST_TIMEOUT: "请求超时",
  RESULT_UNKNOWN: "正在核对保存结果",
  HISTORICAL_DATA_UNAVAILABLE: "历史数据暂不可用",
  GEOMETRY_UNAVAILABLE: "铁路轨迹暂不可用",
  AI_UNAVAILABLE: "AI 服务未接入",
  UNKNOWN_ERROR: "暂时无法完成，请重试",
  // MVP 只读接口（docs/design/mvp-contract.md §8）
  SAME_STATION: "出发站与到达站相同，请重新选择",
  DATE_OUTSIDE_COVERAGE: "参考服务日超出该数据版本的覆盖范围",
  SEGMENT_ORDER_INVALID: "所选区间与车次停站不匹配",
  DATASET_NOT_FOUND: "找不到指定的数据版本",
  STATION_NOT_FOUND: "找不到指定的车站",
  TRIP_NOT_FOUND: "找不到指定的车次",
  DATASET_NOT_ACTIVE: "该数据版本尚未激活",
  SERVICE_NOT_RUNNING: "该车次在所选参考服务日没有开行",
  DATASET_NOT_READY: "当前没有可用的数据版本",
  DATABASE_UNAVAILABLE: "数据库暂不可用",
  INTERNAL_ERROR: "服务内部错误，请稍后重试",
  NOT_IN_MVP: "该功能不在本轮 MVP 范围",
};

const HTTP_TO_CODE = {
  401: "AUTH_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "PLAN_VERSION_CONFLICT",
  422: "VALIDATION_FAILED",
  429: "UPSTREAM_QUOTA",
  500: "INTERNAL_ERROR",
  503: "DATABASE_UNAVAILABLE",
};

export function normalizeError(raw) {
  if (!raw || typeof raw !== "object") {
    return { code: "UNKNOWN_ERROR", message: ERROR_MESSAGES.UNKNOWN_ERROR };
  }
  const code = raw.code && ERROR_MESSAGES[raw.code] ? raw.code : HTTP_TO_CODE[raw.httpStatus] ?? "UNKNOWN_ERROR";
  return {
    code,
    message: typeof raw.message === "string" && raw.message.trim()
      ? raw.message
      : ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN_ERROR,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function deepClone(value) {
  return value === undefined ? value : structuredClone(value);
}

/* 迟到响应夹具：第一次查询延迟返回，用于验证旧响应不会覆盖新状态。 */
let delayedFirstCallPending = false;

/* ---------- 开发夹具（?dev=1）：仅界面检查，不是真实车次/几何证据 ---------- */

const FIXTURE_CONTEXT = {
  dataset: {
    version: "dev-fixture",
    sha256: "DEV-FIXTURE",
    sourceUrl: "https://example.invalid/dev-fixture",
    feedVersion: "dev",
    coverageStart: "2026-11-01",
    coverageEnd: "2027-02-02",
    importedAt: "2026-11-16T00:00:00Z",
    coordinateSystem: "WGS84",
    attribution: "开发夹具（?dev=1），不是真实数据",
    files: [],
    warnings: ["开发夹具：仅用于 ?dev=1 界面检查，不代表真实车次、时刻或几何。"],
  },
  defaultReferenceServiceDate: "2026-11-16",
  dateMode: "SELECTABLE_REFERENCE_SERVICE_DATE",
  timezone: "Asia/Shanghai",
  capabilities: { directOnly: true, fares: false, transfers: false, geometry: true },
  replayLabel: "历史回放 · 参考日期/版本",
};

const FIXTURE_STATIONS = [
  { stopId: "NKH", stopName: "南京南", longitude: 118.793052, latitude: 31.970797, coordinateSystem: "WGS84", locationType: 0 },
  { stopId: "AOH", stopName: "上海虹桥", longitude: 121.3201, latitude: 31.1945, coordinateSystem: "WGS84", locationType: 0 },
  { stopId: "VNP", stopName: "北京南", longitude: 116.3785, latitude: 39.8624, coordinateSystem: "WGS84", locationType: 0 },
  { stopId: "HBB", stopName: "哈尔滨", longitude: 126.6254, latitude: 45.76, coordinateSystem: "WGS84", locationType: 0 },
];

function fixtureStop(stopId, sequence, arrivalTime, departureTime, arrivalSeconds, departureSeconds, dayOffset) {
  const station = FIXTURE_STATIONS.find((item) => item.stopId === stopId);
  return {
    stopId,
    stopName: station?.stopName ?? stopId,
    stopSequence: sequence,
    arrivalTime,
    departureTime,
    arrivalSeconds,
    departureSeconds,
    arrivalDateTime: dayOffset ? "2026-11-17T02:06:00+08:00" : null,
    departureDateTime: null,
    arrivalDayOffset: dayOffset ? 1 : 0,
    departureDayOffset: 0,
  };
}

const FIXTURE_TRIP = {
  segmentId: "dev-G7179:1:3",
  tripId: "dev-G7179",
  trainName: "G7179（夹具）",
  serviceId: "dev-S75",
  shapeId: "dev-shape",
  boardSequence: 1,
  alightSequence: 3,
  from: fixtureStop("NKH", 1, "06:20:00", "06:20:00", 22800, 22800, 0),
  to: fixtureStop("AOH", 3, "07:49:00", "07:49:00", 28140, 28140, 0),
};

const FIXTURE_STOPS = [
  fixtureStop("NKH", 1, "06:20:00", "06:20:00", 22800, 22800, 0),
  fixtureStop("VNP", 2, "07:10:00", "07:12:00", 25800, 25920, 0),
  fixtureStop("AOH", 3, "07:49:00", "07:49:00", 28140, 28140, 0),
];

export function createApi({ live = false } = {}) {
  const apiBase = config.apiBase ?? "";
  const explicitMode = config.dataMode === "fixture" || config.dataMode === "live" ? config.dataMode : null;
  const devFixture = new URLSearchParams(location.search).get("dev") === "1";
  // ?dev=1 是显式的开发夹具开关，必须优先于配置的默认 live；真实模式仍是缺省。
  const mode = live ? "live" : devFixture ? "fixture" : (explicitMode ?? "live");
  const synthetic = mode === "fixture";
  let scenarioKey = "complete";

  function setScenario(key) {
    scenarioKey = key;
    delayedFirstCallPending = false;
  }

  function getScenario() {
    return SCENARIOS[scenarioKey] ?? SCENARIOS.complete;
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), options.timeoutMs ?? 10000);
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    try {
      const response = await fetch(`${apiBase}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: "same-origin",
        signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw {
          httpStatus: response.status,
          code: payload?.error?.code,
          message: payload?.error?.message,
        };
      }
      return { ok: true, data: payload };
    } catch (error) {
      if (error && typeof error === "object" && "httpStatus" in error) {
        return { ok: false, error: normalizeError(error), offline: false };
      }
      if (signal.aborted) {
        return { ok: false, error: normalizeError({ code: "REQUEST_TIMEOUT" }), offline: false };
      }
      return { ok: false, error: normalizeError({ code: "NETWORK_OFFLINE" }), offline: true };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  /* ---------- MVP 只读接口 ---------- */

  async function loadContext() {
    if (synthetic) {
      await sleep(80);
      return { ok: true, data: { ...deepClone(FIXTURE_CONTEXT), synthetic: true } };
    }
    const response = await request("/api/mvp/context");
    if (!response.ok) return response;
    return { ok: true, data: { ...response.data, synthetic: false } };
  }

  async function searchStations({ datasetVersion, q, offset = 0, limit = 20 }) {
    if (synthetic) {
      await sleep(120);
      const needle = String(q ?? "").trim().toLowerCase();
      const items = FIXTURE_STATIONS.filter(
        (station) => !needle || station.stopName.toLowerCase().includes(needle)
          || station.stopId.toLowerCase().includes(needle)
      );
      return {
        ok: true,
        data: {
          datasetVersion: FIXTURE_CONTEXT.dataset.version,
          items: deepClone(items),
          total: items.length,
          offset,
          limit,
          hasMore: false,
        },
      };
    }
    const params = new URLSearchParams({
      datasetVersion: datasetVersion ?? "",
      q: q ?? "",
      offset: String(offset),
      limit: String(limit),
    });
    return request(`/api/mvp/stations?${params.toString()}`);
  }

  async function searchTrips({ datasetVersion, fromStopId, toStopId, referenceServiceDate }) {
    if (synthetic) {
      await sleep(200);
      const match = fromStopId === "NKH" && toStopId === "AOH";
      return {
        ok: true,
        data: {
          datasetVersion: FIXTURE_CONTEXT.dataset.version,
          referenceServiceDate,
          fromStopId,
          toStopId,
          items: match ? [deepClone(FIXTURE_TRIP)] : [],
          total: match ? 1 : 0,
          emptyReason: match ? null : "NO_DIRECT_TRIP",
          replayLabel: FIXTURE_CONTEXT.replayLabel,
        },
      };
    }
    const params = new URLSearchParams({
      datasetVersion: datasetVersion ?? "",
      fromStopId: fromStopId ?? "",
      toStopId: toStopId ?? "",
      referenceServiceDate: referenceServiceDate ?? "",
    });
    return request(`/api/mvp/trips?${params.toString()}`);
  }

  async function loadTripStops({ datasetVersion, tripId, referenceServiceDate }) {
    if (synthetic) {
      await sleep(160);
      if (tripId !== FIXTURE_TRIP.tripId) {
        return { ok: false, error: normalizeError({ code: "TRIP_NOT_FOUND" }) };
      }
      return {
        ok: true,
        data: {
          datasetVersion: FIXTURE_CONTEXT.dataset.version,
          referenceServiceDate,
          tripId,
          trainName: FIXTURE_TRIP.trainName,
          serviceId: FIXTURE_TRIP.serviceId,
          shapeId: FIXTURE_TRIP.shapeId,
          stops: deepClone(FIXTURE_STOPS),
        },
      };
    }
    const params = new URLSearchParams({
      datasetVersion: datasetVersion ?? "",
      referenceServiceDate: referenceServiceDate ?? "",
    });
    return request(`/api/mvp/trips/${encodeURIComponent(tripId)}/stops?${params.toString()}`);
  }

  async function loadGeometry({
    datasetVersion, tripId, referenceServiceDate, fromStopId, toStopId, boardSequence, alightSequence,
  }, signal) {
    if (synthetic) {
      await sleep(180);
      return {
        ok: true,
        data: {
          datasetVersion: FIXTURE_CONTEXT.dataset.version,
          referenceServiceDate,
          tripId,
          shapeId: FIXTURE_TRIP.shapeId,
          fromStopId,
          toStopId,
          boardSequence,
          alightSequence,
          coordinateSystem: "WGS84",
          status: "READY",
          reason: null,
          points: [
            [118.793052, 31.970797],
            [119.4, 31.8],
            [120.3, 31.5],
            [121.3201, 31.1945],
          ],
          accuracy: "APPROXIMATE",
          method: "ORDERED_PROJECTION_200M_V1",
          fromDistanceMeters: 61.1,
          toDistanceMeters: 112.7,
          source: "开发夹具（?dev=1），不是真实轨迹",
        },
      };
    }
    const params = new URLSearchParams({
      datasetVersion: datasetVersion ?? "",
      referenceServiceDate: referenceServiceDate ?? "",
      fromStopId: fromStopId ?? "",
      toStopId: toStopId ?? "",
      boardSequence: String(boardSequence),
      alightSequence: String(alightSequence),
    });
    return request(`/api/mvp/trips/${encodeURIComponent(tripId)}/geometry?${params.toString()}`, { signal });
  }

  /* ---------- 旧多城市/规划/AI 适配器（后置功能，页面不再挂载） ---------- */

  function legacyUnavailable() {
    return { ok: false, error: normalizeError({ code: "NOT_IN_MVP" }) };
  }

  function fixtureDelay() {
    const scenario = getScenario();
    if (scenario.delayMode === "never") return 60000;
    if (scenario.delayMode === "first") {
      if (!delayedFirstCallPending) {
        delayedFirstCallPending = true;
        return 2600;
      }
      return 220;
    }
    if (scenarioKey === "complete" || scenarioKey === "delayed") return 450;
    if (scenarioKey === "error") return 240;
    return 260;
  }

  function buildEmptyReason(plan) {
    const nodes = plan?.nodes ?? [];
    const legs = [];
    for (let index = 0; index < nodes.length - 1; index += 1) {
      legs.push({
        index,
        from: nodes[index].cityName,
        to: nodes[index + 1].cityName,
        fromStation: nodes[index].departureStationName ?? nodes[index].stationName,
        toStation: nodes[index + 1].arrivalStationName ?? nodes[index + 1].stationName,
        date: plan.startDate,
        message: "该日期与车站组合在示例数据中没有匹配车次",
        synthetic: true,
      });
    }
    return {
      title: "无可行车次",
      legs,
      hint: "可修改日期、车站或城市顺序后重新查询",
      synthetic: true,
    };
  }

  async function loadDataset() {
    if (!synthetic) return legacyUnavailable();
    await sleep(120);
    return { ok: true, data: deepClone(DATASET) };
  }

  async function searchPlaces(query) {
    if (!query || !query.trim()) return { ok: true, items: [] };
    if (!synthetic) return legacyUnavailable();
    await sleep(140);
    return { ok: true, items: searchLocalPlaces(query) };
  }

  async function queryPlans(request_) {
    if (!synthetic) return legacyUnavailable();
    const { plan } = request_;
    const scenario = getScenario();
    await sleep(fixtureDelay());

    if (scenario.errorCode) {
      return { ok: false, error: normalizeError({ code: scenario.errorCode }) };
    }
    if (scenario.emptyReason) {
      return {
        ok: true,
        data: {
          status: "empty",
          reason: deepClone(buildEmptyReason(plan)),
          datasetVersion: DATASET.version,
        },
      };
    }
    const items = deepClone(candidatesForScenario(scenarioKey));
    return {
      ok: true,
      data: {
        status: "ready",
        items,
        datasetVersion: DATASET.version,
      },
    };
  }

  async function sendAiMessage() {
    if (!synthetic) return legacyUnavailable();
    await sleep(600);
    return { ok: false, error: normalizeError({ code: "AI_UNAVAILABLE" }) };
  }

  return {
    mode,
    synthetic,
    setScenario,
    loadContext,
    searchStations,
    searchTrips,
    loadTripStops,
    loadGeometry,
    replayCities: (datasetVersion) => request(`/api/replay/cities?${new URLSearchParams({ datasetVersion })}`),
    replayStations: (datasetVersion) => request(`/api/replay/stations?${new URLSearchParams({ datasetVersion })}`),
    replayCity: (datasetVersion, cityId) => request(`/api/replay/cities/${encodeURIComponent(cityId)}?${new URLSearchParams({ datasetVersion })}`),
    replayLocations: (datasetVersion, q, offset, signal) => request(`/api/replay/locations?${new URLSearchParams({ datasetVersion, q, offset, limit: 10 })}`, { signal }),
    searchAmapPlaces: (q, signal) => request(`/api/places?${new URLSearchParams({ q })}`, { signal }),
    replayPlan: (body, signal) => request("/api/replay/plans", { method: "POST", body, signal }),
    // 后置功能保留的旧入口（页面不再挂载）
    loadDataset,
    searchPlaces,
    queryPlans,
    sendAiMessage,
  };
}

export function errorText(error) {
  return error?.message ?? ERROR_MESSAGES.UNKNOWN_ERROR;
}

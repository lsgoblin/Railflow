/* 合成夹具：没有后端时 api.js 使用这里的数据。
 * 每条记录带 synthetic: true；这些数据只验证界面状态，不是真实车次、时刻或价格，
 * 也不能作为实际铁路几何证据。前端不在这里计算换乘、耗时、排序或票价合计。
 */

export const DATASET = {
  id: "fixture-history-2025",
  version: "示例数据 · 历史回放 2025 版",
  shortVersion: "2025 版",
  synthetic: true,
  source: "fixtures.js",
  timeZone: "Asia/Shanghai",
  updatedAt: "2026-11-16 08:00",
  dateRange: { min: "2026-11-01", max: "2026-11-30" },
  defaultDate: "2026-11-17",
  replay: { taskDay: "2026-11-17", referenceDay: "2025-11-16", offset: "统一日偏移由服务端提供" },
};

export const CITIES = [
  { id: "city-bj", name: "北京", province: "北京", aliases: ["北京市"], coordinate: [116.407, 39.904], labelPriority: 1, synthetic: true },
  { id: "city-nj", name: "南京", province: "江苏", aliases: ["南京市"], coordinate: [118.796, 32.06], labelPriority: 2, synthetic: true },
  { id: "city-sh", name: "上海", province: "上海", aliases: ["上海市"], coordinate: [121.473, 31.23], labelPriority: 1, synthetic: true },
  { id: "city-zz", name: "郑州", province: "河南", aliases: ["郑州市"], coordinate: [113.625, 34.746], labelPriority: 2, synthetic: true },
  { id: "city-xa", name: "西安", province: "陕西", aliases: ["西安市"], coordinate: [108.94, 34.341], labelPriority: 2, synthetic: true },
  { id: "city-wh", name: "武汉", province: "湖北", aliases: ["武汉市"], coordinate: [114.305, 30.593], labelPriority: 2, synthetic: true },
  { id: "city-cd", name: "成都", province: "四川", aliases: ["成都市"], coordinate: [104.066, 30.573], labelPriority: 2, synthetic: true },
  { id: "city-cq", name: "重庆", province: "重庆", aliases: ["重庆市"], coordinate: [106.551, 29.563], labelPriority: 2, synthetic: true },
  { id: "city-gz", name: "广州", province: "广东", aliases: ["广州市"], coordinate: [113.264, 23.129], labelPriority: 2, synthetic: true },
  { id: "city-sz", name: "深圳", province: "广东", aliases: ["深圳市"], coordinate: [114.057, 22.543], labelPriority: 3, synthetic: true },
  { id: "city-hz", name: "杭州", province: "浙江", aliases: ["杭州市"], coordinate: [120.155, 30.274], labelPriority: 2, synthetic: true },
  { id: "city-nn", name: "南宁", province: "广西", aliases: ["南宁市"], coordinate: [108.32, 22.824], labelPriority: 3, synthetic: true },
  { id: "city-heb", name: "哈尔滨", province: "黑龙江", aliases: ["哈尔滨市"], coordinate: [126.535, 45.803], labelPriority: 3, synthetic: true },
  { id: "city-wlmq", name: "乌鲁木齐", province: "新疆", aliases: ["乌鲁木齐市"], coordinate: [87.617, 43.793], labelPriority: 3, synthetic: true },
  { id: "city-lz", name: "兰州", province: "甘肃", aliases: ["兰州市"], coordinate: [103.834, 36.061], labelPriority: 3, synthetic: true },
  { id: "city-jn", name: "济南", province: "山东", aliases: ["济南市"], coordinate: [117.12, 36.651], labelPriority: 3, synthetic: true },
  { id: "city-xz", name: "徐州", province: "江苏", aliases: ["徐州市"], coordinate: [117.285, 34.205], labelPriority: 4, synthetic: true },
  { id: "city-hf", name: "合肥", province: "安徽", aliases: ["合肥市"], coordinate: [117.283, 31.861], labelPriority: 4, synthetic: true },
  { id: "city-nc", name: "南昌", province: "江西", aliases: ["南昌市"], coordinate: [115.858, 28.683], labelPriority: 4, synthetic: true },
  { id: "city-cs", name: "长沙", province: "湖南", aliases: ["长沙市"], coordinate: [112.938, 28.228], labelPriority: 3, synthetic: true },
  { id: "city-tj", name: "天津", province: "天津", aliases: ["天津市"], coordinate: [117.2, 39.084], labelPriority: 3, synthetic: true },
];

export const STATIONS = [
  { id: "station-bjn", cityId: "city-bj", name: "北京南", aliases: ["北京南站"], coordinate: [116.378, 39.865], source: "示例数据", synthetic: true },
  { id: "station-bjx", cityId: "city-bj", name: "北京西", aliases: ["北京西站"], coordinate: [116.322, 39.895], source: "示例数据", synthetic: true },
  { id: "station-bj", cityId: "city-bj", name: "北京", aliases: ["北京站"], coordinate: [116.427, 39.904], source: "示例数据", synthetic: true },
  { id: "station-njn", cityId: "city-nj", name: "南京南", aliases: ["南京南站"], coordinate: [118.797, 31.968], source: "示例数据", synthetic: true },
  { id: "station-nj", cityId: "city-nj", name: "南京", aliases: ["南京站"], coordinate: [118.796, 32.087], source: "示例数据", synthetic: true },
  { id: "station-shhq", cityId: "city-sh", name: "上海虹桥", aliases: ["上海虹桥站"], coordinate: [121.32, 31.194], source: "示例数据", synthetic: true },
  { id: "station-sh", cityId: "city-sh", name: "上海", aliases: ["上海站"], coordinate: [121.455, 31.249], source: "示例数据", synthetic: true },
  { id: "station-zzd", cityId: "city-zz", name: "郑州东", aliases: ["郑州东站"], coordinate: [113.778, 34.757], source: "示例数据", synthetic: true },
  { id: "station-zz", cityId: "city-zz", name: "郑州", aliases: ["郑州站"], coordinate: [113.665, 34.746], source: "示例数据", synthetic: true },
  { id: "station-xab", cityId: "city-xa", name: "西安北", aliases: ["西安北站"], coordinate: [108.939, 34.376], source: "示例数据", synthetic: true },
  { id: "station-xa", cityId: "city-xa", name: "西安", aliases: ["西安站"], coordinate: [108.94, 34.341], source: "示例数据", synthetic: true },
  { id: "station-wh", cityId: "city-wh", name: "武汉", aliases: ["武汉站"], coordinate: [114.424, 30.607], source: "示例数据", synthetic: true },
  { id: "station-hank", cityId: "city-wh", name: "汉口", aliases: ["汉口站"], coordinate: [114.251, 30.618], source: "示例数据", synthetic: true },
  { id: "station-cd", cityId: "city-cd", name: "成都东", aliases: ["成都东站"], coordinate: [104.141, 30.63], source: "示例数据", synthetic: true },
  { id: "station-cq", cityId: "city-cq", name: "重庆北", aliases: ["重庆北站"], coordinate: [106.551, 29.61], source: "示例数据", synthetic: true },
  { id: "station-gz", cityId: "city-gz", name: "广州南", aliases: ["广州南站"], coordinate: [113.269, 22.989], source: "示例数据", synthetic: true },
  { id: "station-sz", cityId: "city-sz", name: "深圳北", aliases: ["深圳北站"], coordinate: [114.029, 22.61], source: "示例数据", synthetic: true },
  { id: "station-hz", cityId: "city-hz", name: "杭州东", aliases: ["杭州东站"], coordinate: [120.213, 30.292], source: "示例数据", synthetic: true },
  { id: "station-nn", cityId: "city-nn", name: "南宁东", aliases: ["南宁东站"], coordinate: [108.388, 22.844], source: "示例数据", synthetic: true },
  { id: "station-heb", cityId: "city-heb", name: "哈尔滨西", aliases: ["哈尔滨西站"], coordinate: [126.567, 45.758], source: "示例数据", synthetic: true },
  { id: "station-heb2", cityId: "city-heb", name: "哈尔滨", aliases: ["哈尔滨站"], coordinate: [126.628, 45.76], source: "示例数据", synthetic: true },
  { id: "station-wlmq", cityId: "city-wlmq", name: "乌鲁木齐", aliases: ["乌鲁木齐站"], coordinate: [87.575, 43.787], source: "示例数据", synthetic: true },
  { id: "station-lz", cityId: "city-lz", name: "兰州西", aliases: ["兰州西站"], coordinate: [103.75, 36.09], source: "示例数据", synthetic: true },
  { id: "station-jn", cityId: "city-jn", name: "济南西", aliases: ["济南西站"], coordinate: [116.89, 36.67], source: "示例数据", synthetic: true },
  { id: "station-xz", cityId: "city-xz", name: "徐州东", aliases: ["徐州东站"], coordinate: [117.3, 34.27], source: "示例数据", synthetic: true },
  { id: "station-hf", cityId: "city-hf", name: "合肥南", aliases: ["合肥南站"], coordinate: [117.3, 31.79], source: "示例数据", synthetic: true },
  { id: "station-nc", cityId: "city-nc", name: "南昌西", aliases: ["南昌西站"], coordinate: [115.79, 28.63], source: "示例数据", synthetic: true },
  { id: "station-cs", cityId: "city-cs", name: "长沙南", aliases: ["长沙南站"], coordinate: [113.065, 28.15], source: "示例数据", synthetic: true },
  { id: "station-tj", cityId: "city-tj", name: "天津南", aliases: ["天津南站"], coordinate: [117.06, 39.05], source: "示例数据", synthetic: true },
];

/* 合成轨迹：沿常见铁路走廊绘制的测试折线，仅用于验证覆盖物绘制。
 * 不能当作实际铁路数据，也不能用直线连接端点冒充轨迹。 */
export const GEOMETRY = {
  "geo-bjn-njn": {
    shapeId: "fixture-shape-bjn-njn",
    source: "示例数据 · 合成轨迹",
    synthetic: true,
    points: [
      [116.378, 39.865], [116.55, 39.72], [116.75, 39.36], [117.06, 39.05], [116.95, 38.62],
      [116.83, 38.3], [116.44, 37.39], [116.89, 36.67], [117.1, 36.19], [116.93, 35.56],
      [117.25, 35.11], [117.55, 34.87], [117.3, 34.27], [117.03, 33.6], [117.42, 32.92],
      [117.68, 32.53], [118.31, 32.3], [118.797, 31.968],
    ],
  },
  "geo-njn-shhq": {
    shapeId: "fixture-shape-njn-shhq",
    source: "示例数据 · 合成轨迹",
    synthetic: true,
    points: [
      [118.797, 31.968], [119.42, 32.15], [119.58, 32.0], [119.94, 31.85],
      [120.4, 31.6], [120.65, 31.42], [121.32, 31.194],
    ],
  },
  "geo-bjn-njzc": {
    shapeId: "fixture-shape-bjn-njzc",
    source: "示例数据 · 合成轨迹",
    synthetic: true,
    points: [
      [116.378, 39.865], [116.75, 39.36], [117.06, 39.05], [116.83, 38.3],
      [116.44, 37.39], [116.89, 36.67], [116.93, 35.56], [117.55, 34.87],
      [117.3, 34.27], [117.42, 32.92], [118.31, 32.3], [118.797, 31.968], [118.796, 32.087],
    ],
  },
  "geo-njzc-shhq": {
    shapeId: "fixture-shape-njzc-shhq",
    source: "示例数据 · 合成轨迹",
    synthetic: true,
    points: [
      [118.796, 32.087], [118.797, 31.968], [119.42, 32.15], [119.58, 32.0],
      [119.94, 31.85], [120.4, 31.6], [120.65, 31.42], [121.32, 31.194],
    ],
  },
};

const FARE_VERSION = "历史票价 · 2025 版";
const DATA_VERSION = "示例数据 · 历史回放 2025 版";

function leg(base) {
  return {
    synthetic: true,
    source: "fixtures.js",
    seatType: "二等座",
    price: null,
    fareStatus: "unknown",
    timeStatus: "verified",
    geometryStatus: "ready",
    geometry: null,
    arrivalDayOffset: 0,
    dataVersion: DATA_VERSION,
    timeSource: "示例数据 · 2025 版时刻",
    geometrySource: "示例数据 · 合成轨迹",
    ...base,
  };
}

function knownPrice(amount) {
  return {
    amount,
    currency: "CNY",
    version: FARE_VERSION,
    synthetic: true,
    source: "示例数据",
  };
}

function candidate(base) {
  return {
    synthetic: true,
    source: "fixtures.js",
    dataVersion: DATA_VERSION,
    status: "ready",
    stationChange: false,
    legs: [],
    ...base,
  };
}

function completeCandidates() {
  const legA = leg({
    legId: "leg-a1",
    trainNumber: "G531",
    fromCity: "北京",
    toCity: "南京",
    fromStation: "北京南",
    toStation: "南京南",
    departureDate: "2026-11-17",
    departureTime: "08:05",
    arrivalDate: "2026-11-17",
    arrivalTime: "11:48",
    fareStatus: "known",
    price: knownPrice("443.50"),
    geometry: GEOMETRY["geo-bjn-njn"],
  });

  return [
    candidate({
      candidateId: "cand-1",
      label: "方案 1",
      transferCount: 1,
      firstDeparture: { date: "2026-11-17", time: "08:05" },
      lastArrival: { date: "2026-11-18", time: "09:12", dayOffset: 1 },
      totalDurationMinutes: 1507,
      fare: { knownTotal: "583.00", unknownSegments: 0, currency: "CNY", version: FARE_VERSION, synthetic: true, source: "示例数据" },
      legs: [
        legA,
        leg({
          legId: "leg-a2",
          trainNumber: "G7179",
          fromCity: "南京",
          toCity: "上海",
          fromStation: "南京南",
          toStation: "上海虹桥",
          departureDate: "2026-11-18",
          departureTime: "07:40",
          arrivalDate: "2026-11-18",
          arrivalTime: "09:12",
          fareStatus: "known",
          price: knownPrice("139.50"),
          geometry: GEOMETRY["geo-njn-shhq"],
        }),
      ],
    }),
    candidate({
      candidateId: "cand-2",
      label: "方案 2",
      transferCount: 1,
      firstDeparture: { date: "2026-11-17", time: "08:05" },
      lastArrival: { date: "2026-11-18", time: "11:39", dayOffset: 1 },
      totalDurationMinutes: 1654,
      fare: { knownTotal: "597.00", unknownSegments: 0, currency: "CNY", version: FARE_VERSION, synthetic: true, source: "示例数据" },
      legs: [
        legA,
        leg({
          legId: "leg-b2",
          trainNumber: "G7005",
          fromCity: "南京",
          toCity: "上海",
          fromStation: "南京南",
          toStation: "上海虹桥",
          departureDate: "2026-11-18",
          departureTime: "10:20",
          arrivalDate: "2026-11-18",
          arrivalTime: "11:39",
          fareStatus: "known",
          price: knownPrice("153.50"),
          geometry: GEOMETRY["geo-njn-shhq"],
        }),
      ],
    }),
    candidate({
      candidateId: "cand-3",
      label: "方案 3",
      transferCount: 1,
      firstDeparture: { date: "2026-11-17", time: "12:10" },
      lastArrival: { date: "2026-11-18", time: "09:59", dayOffset: 1 },
      totalDurationMinutes: 1309,
      stationChange: true,
      stationChangeNote: "到站为南京站，下段从南京南出发；同城跨站接驳尚未核实。",
      fare: { knownTotal: "571.50", unknownSegments: 0, currency: "CNY", version: FARE_VERSION, synthetic: true, source: "示例数据" },
      legs: [
        leg({
          legId: "leg-c1",
          trainNumber: "G765",
          fromCity: "北京",
          toCity: "南京",
          fromStation: "北京南",
          toStation: "南京",
          departureDate: "2026-11-17",
          departureTime: "12:10",
          arrivalDate: "2026-11-17",
          arrivalTime: "15:28",
          fareStatus: "known",
          price: knownPrice("427.00"),
          geometry: GEOMETRY["geo-bjn-njzc"],
        }),
        leg({
          legId: "leg-c2",
          trainNumber: "G7101",
          fromCity: "南京",
          toCity: "上海",
          fromStation: "南京南",
          toStation: "上海虹桥",
          departureDate: "2026-11-18",
          departureTime: "08:30",
          arrivalDate: "2026-11-18",
          arrivalTime: "09:59",
          fareStatus: "known",
          price: knownPrice("144.50"),
          geometry: GEOMETRY["geo-njzc-shhq"],
        }),
      ],
    }),
  ];
}

function missingGeometryCandidates() {
  const items = completeCandidates();
  const target = items[0];
  target.status = "partial";
  target.legs[1].geometryStatus = "missing";
  target.legs[1].geometry = null;
  target.legs[1].geometryMissingReason = "该区间尚未取得可核对的铁路轨迹";
  return items;
}

function unknownFareCandidates() {
  const items = completeCandidates();
  const target = items[0];
  target.status = "partial";
  target.legs[1].fareStatus = "unknown";
  target.legs[1].price = null;
  target.fare = { knownTotal: "443.50", unknownSegments: 1, currency: "CNY", version: FARE_VERSION, synthetic: true, source: "示例数据" };
  items[1].fare = { knownTotal: null, unknownSegments: 2, currency: "CNY", version: FARE_VERSION, synthetic: true, source: "示例数据" };
  items[1].status = "partial";
  items[1].legs[0].fareStatus = "unknown";
  items[1].legs[0].price = null;
  items[1].legs[1].fareStatus = "unknown";
  items[1].legs[1].price = null;
  return items;
}

export const SCENARIOS = {
  empty: { key: "empty", label: "空态", plan: { nodes: [], startDate: "" } },
  complete: { key: "complete", label: "完整方案", plan: "default", candidates: completeCandidates },
  missingGeometry: {
    key: "missingGeometry",
    label: "缺几何",
    plan: "default",
    candidates: missingGeometryCandidates,
  },
  unknownFare: { key: "unknownFare", label: "票价未知", plan: "default", candidates: unknownFareCandidates },
  noTrains: { key: "noTrains", label: "无可行车次", plan: "default", emptyReason: true },
  loading: { key: "loading", label: "加载态", plan: "default", delayMode: "never" },
  error: { key: "error", label: "错误态", plan: "default", errorCode: "HISTORICAL_DATA_UNAVAILABLE" },
  delayed: { key: "delayed", label: "迟到响应", plan: "default", delayMode: "first", candidates: completeCandidates },
};

export function defaultPlan() {
  const cityBeijing = CITIES.find((city) => city.id === "city-bj");
  const cityNanjing = CITIES.find((city) => city.id === "city-nj");
  const cityShanghai = CITIES.find((city) => city.id === "city-sh");
  const station = (id) => STATIONS.find((item) => item.id === id);
  return {
    nodes: [
      makeNode("node-1", cityBeijing, null, station("station-bjn"), null),
      makeNode("node-2", cityNanjing, station("station-njn"), station("station-njn"), 1),
      makeNode("node-3", cityShanghai, station("station-shhq"), null, null),
    ],
    startDate: DATASET.defaultDate,
  };
}

function makeNode(nodeId, city, arrivalStation, departureStation, stayDays) {
  return {
    nodeId,
    cityId: city.id,
    cityName: city.name,
    province: city.province,
    coordinate: city.coordinate,
    stationId: departureStation?.id ?? arrivalStation?.id ?? null,
    stationName: departureStation?.name ?? arrivalStation?.name ?? "待匹配",
    arrivalStationId: arrivalStation?.id ?? null,
    arrivalStationName: arrivalStation?.name ?? null,
    departureStationId: departureStation?.id ?? null,
    departureStationName: departureStation?.name ?? null,
    stayDays,
    synthetic: true,
  };
}

export function stationsOfCity(cityId) {
  return STATIONS.filter((station) => station.cityId === cityId);
}

export function buildPlanForScenario(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.complete;
  if (scenario.plan === "default") return defaultPlan();
  return { nodes: [], startDate: DATASET.defaultDate };
}

export function candidatesForScenario(scenarioKey) {
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.complete;
  return typeof scenario.candidates === "function" ? scenario.candidates() : [];
}

export function searchLocalPlaces(query) {
  const keyword = String(query ?? "").trim();
  if (!keyword) return [];
  const normalized = keyword.toLowerCase();
  const matches = (values) => values.some((value) => String(value ?? "").toLowerCase().includes(normalized));

  const cityItems = CITIES.filter((city) => matches([city.name, city.province, ...(city.aliases ?? [])])).map((city) => ({
    id: city.id,
    type: "city",
    name: city.name,
    province: city.province,
    cityName: city.name,
    aliases: city.aliases,
    coordinate: city.coordinate,
    source: "示例数据",
    synthetic: true,
  }));

  const stationItems = STATIONS.filter((station) => {
    const city = CITIES.find((item) => item.id === station.cityId);
    return matches([station.name, ...(station.aliases ?? []), city?.name]);
  }).map((station) => {
    const city = CITIES.find((item) => item.id === station.cityId);
    return {
      id: station.id,
      type: "station",
      name: station.name,
      cityId: station.cityId,
      cityName: city?.name ?? "",
      province: city?.province ?? "",
      coordinate: station.coordinate,
      source: "示例数据",
      synthetic: true,
    };
  });

  return [...cityItems, ...stationItems].slice(0, 10);
}

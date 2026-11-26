/* 地图适配器：同一套覆盖物绘制供两个实现复用。
 * - AmapAdapter：config.local.js 有 jsApiKey 时启用，用高德 JS API 画底图；
 * - OfflineAdapter：无 Key 或底图加载失败时的浅色画布 + 经纬度等距投影，不画任何底图瓦片。
 * 铁路轨迹只绘制数据中已取得的几何；缺失区间留空并标注，绝不用直线补齐。
 */

const CHINA_BOUNDS = [
  [73.4, 18.1],
  [135.2, 53.8],
];

const ROUTE_STYLE = {
  current: { widths: [16, 12, 8], colors: ["#ffffff", "#0b8655", "#00c86e"] },
  selected: { widths: [18, 14, 10], colors: ["#ffffff", "#0b8655", "#00c86e"] },
  alt: { widths: [12, 8, 5], colors: ["#ffffff", "#568b74", "#b8decf"] },
  preview: { widths: [12, 8, 5], colors: ["#ffffff", "#0b8655", "#00c86e"], dash: "12 8" },
};

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

/* ---------- WGS84 → GCJ-02（只用于高德底图偏移校正，不改写源坐标） ---------- */

const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

function transformLat(lng, lat) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin((lat / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((lat / 12.0) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(lng, lat) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += ((20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin((lng / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((lng / 12.0) * Math.PI) + 300.0 * Math.sin((lng / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

function wgs84ToGcj02(lng, lat) {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lng, lat];
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lng + dLng, lat + dLat];
}

export function gcj02ToWgs84(lng, lat) {
  // 将高德地点统一到覆盖物使用的 WGS84，保留搜索结果里的原始坐标。
  let longitude = lng;
  let latitude = lat;
  for (let step = 0; step < 3; step += 1) {
    const [shiftedLng, shiftedLat] = wgs84ToGcj02(longitude, latitude);
    longitude += lng - shiftedLng;
    latitude += lat - shiftedLat;
  }
  return [longitude, latitude];
}

/* ---------- 覆盖物模型：与具体地图引擎无关 ---------- */

export function buildOverlayView({ plan, results, dataset, places }) {
  const nodes = plan?.nodes ?? [];
  const markers = [];
  const lines = [];
  const gaps = [];
  const resultsItems = results?.items ?? [];
  const selected = resultsItems.find((item) => item.candidateId === results?.selectedId) ?? null;

  const stationOf = (id) => (id ? places.stationById.get(id) ?? null : null);
  const coordinateOfNode = (node, role) => {
    if (role === "start") {
      const station = stationOf(node.departureStationId);
      if (station) return station.coordinate;
    }
    if (role === "end") {
      const station = stationOf(node.arrivalStationId);
      if (station) return station.coordinate;
    }
    return node.coordinate ?? null;
  };

  nodes.forEach((node, index) => {
    const role = index === 0 ? "start" : index === nodes.length - 1 ? "end" : "middle";
    const coord = coordinateOfNode(node, role);
    if (!coord) return;
    if (role === "start" || role === "end") {
      const station = role === "start" ? stationOf(node.departureStationId) : stationOf(node.arrivalStationId);
      markers.push({
        kind: role,
        coord,
        nodeId: node.nodeId,
        cityName: node.cityName,
        stationName: station?.name ?? null,
        pendingStation: !station,
      });
      return;
    }
    markers.push({
      kind: "waypoint",
      coord: node.coordinate ?? coord,
      nodeId: node.nodeId,
      cityName: node.cityName,
      index: index + 1,
      stayDays: node.stayDays,
    });
    const arrival = stationOf(node.arrivalStationId);
    const departure = stationOf(node.departureStationId);
    if (arrival) markers.push({ kind: "station", coord: arrival.coordinate, name: arrival.name, nodeId: node.nodeId });
    if (departure && (!arrival || departure.id !== arrival.id)) {
      markers.push({ kind: "station", coord: departure.coordinate, name: departure.name, nodeId: node.nodeId });
    }
  });

  const seenShapes = new Set();
  const missingPairs = new Set();
  if (selected) {
    (selected.legs ?? []).forEach((leg) => {
      if (leg.geometryStatus !== "ready") missingPairs.add(`${leg.fromCity}|${leg.toCity}`);
    });
  }
  if (selected) {
    (selected.legs ?? []).forEach((leg, index) => {
      const geometry = leg.geometry;
      const legSelected = results?.detailsLegId === leg.legId;
      if (leg.geometryStatus === "ready" && geometry?.points?.length > 1) {
        const role = legSelected ? "selected" : leg.timeStatus && leg.timeStatus !== "verified" ? "preview" : "current";
        lines.push({
          key: leg.legId,
          candidateId: selected.candidateId,
          legId: leg.legId,
          role,
          points: geometry.points,
          missing: false,
          fromNode: nodes[index],
          toNode: nodes[index + 1],
        });
        seenShapes.add(geometry.shapeId ?? leg.legId);
      } else {
        const from = nodes[index];
        const to = nodes[index + 1];
        const fromCoord = from ? coordinateOfNode(from, "middle") ?? from.coordinate : null;
        const toCoord = to ? coordinateOfNode(to, "middle") ?? to.coordinate : null;
        if (fromCoord && toCoord) {
          gaps.push({
            key: leg.legId,
            coord: [(fromCoord[0] + toCoord[0]) / 2, (fromCoord[1] + toCoord[1]) / 2],
            text: "铁路轨迹暂不可用",
          });
        }
        lines.push({ key: leg.legId, candidateId: selected.candidateId, legId: leg.legId, role: "missing", points: [], missing: true });
      }
    });
  }

  for (const candidate of resultsItems) {
    if (candidate.candidateId === results?.selectedId) continue;
    for (const leg of candidate.legs ?? []) {
      const geometry = leg.geometry;
      if (leg.geometryStatus !== "ready" || !geometry?.points?.length) continue;
      if (missingPairs.has(`${leg.fromCity}|${leg.toCity}`)) continue;
      const shapeKey = geometry.shapeId ?? `${candidate.candidateId}-${leg.legId}`;
      if (seenShapes.has(shapeKey)) continue;
      seenShapes.add(shapeKey);
      lines.push({ key: `${candidate.candidateId}-${leg.legId}`, candidateId: candidate.candidateId, legId: leg.legId, role: "alt", points: geometry.points, missing: false });
    }
  }

  return {
    synthetic: Boolean(dataset?.synthetic ?? true),
    datasetVersion: dataset?.version ?? null,
    markers,
    lines,
    gaps,
    selectedCandidateId: selected?.candidateId ?? null,
    nodeCount: nodes.length,
  };
}

function flattenBounds(view) {
  const points = [];
  for (const marker of view.markers ?? []) points.push(marker.coord);
  for (const line of view.lines ?? []) points.push(...(line.points ?? []));
  for (const gap of view.gaps ?? []) points.push(gap.coord);
  return points;
}

/* ---------- 共享覆盖物绘制 ---------- */

function createOverlay(container) {
  const wrap = document.createElement("div");
  wrap.className = "map-overlay";
  container.append(wrap);
  return wrap;
}

function bindMapButton(group, activate) {
  let start;
  let moved = false;
  const trackPointer = (event) => {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) moved = true;
  };
  group.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY };
    moved = false;
  });
  group.addEventListener("pointermove", trackPointer);
  group.addEventListener("pointerleave", trackPointer);
  group.addEventListener("pointercancel", () => { moved = true; });
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    trackPointer(event);
    if (!event.detail || !moved) activate(!event.detail);
    start = undefined;
  });
  group.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) activate(true);
  });
}

function drawOverlay({ svg, view, project, width, height, callbacks, showDirectory, showStations }) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const groupAlt = svgEl("g");
  const groupCities = svgEl("g");
  const groupMain = svgEl("g");
  const groupArrows = svgEl("g", { "aria-hidden": "true" });
  const groupHits = svgEl("g");
  const groupStations = svgEl("g");
  const groupMarkers = svgEl("g");
  const groupLabels = svgEl("g");
  svg.append(groupCities, groupAlt, groupMain, groupArrows, groupHits, groupStations, groupMarkers, groupLabels);

  const projected = (coord) => {
    const point = project(coord[0], coord[1]);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return point;
  };

  const isVisible = (point) => point && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
  const cityPositions = [];
  const positionsWithStations = showStations && view.catalogStations?.length;
  for (const city of (showDirectory ? view.cities : null) ?? []) {
    const point = projected([city.longitude, city.latitude]);
    if (!isVisible(point)) continue;
    if (cityPositions.some((other) => Math.abs(other.x - point.x) < 54 && Math.abs(other.y - point.y) < 30)) continue;
    cityPositions.push(point);
    const group = svgEl("g", { class: "overlay-city", transform: `translate(${point.x} ${point.y})`,
      role: "button", tabindex: 0, "aria-label": `添加${city.name}`, "data-city-id": city.cityId });
    const title = svgEl("title");
    title.textContent = city.name;
    const name = svgEl("text", { x: 0, y: positionsWithStations ? -25 : -9, "text-anchor": "middle" });
    name.textContent = city.name;
    group.append(title, svgEl("circle", { r: 13, fill: "transparent" }), svgEl("circle", { r: 4 }), name);
    bindMapButton(group, (keyboard) => callbacks.onCityClick?.(city.cityId, keyboard));
    groupCities.append(group);
  }

  if (positionsWithStations) {
    const displayedStops = new Set(view.markers?.map(({ stopId }) => stopId));
    const pins = [];
    for (const item of view.catalogStations) {
      const { stopId, longitude, latitude } = item.station;
      if (displayedStops.has(stopId)) continue;
      const point = projected([longitude, latitude]);
      if (!isVisible(point)) continue;
      const nearby = pins.find((pin) => Math.hypot(pin.point.x - point.x, pin.point.y - point.y) < 44);
      if (nearby) nearby.items.push(item);
      else pins.push({ point, items: [item] });
    }
    for (const { point, items } of pins) {
      const { stopId, stopName } = items[0].station;
      const multiple = items.length > 1;
      const name = multiple ? `铁路站（${items.length}）` : stopName;
      const action = multiple ? `选择${items.length}个相邻铁路站` : `添加铁路站${stopName}（${stopId}）`;
      const group = svgEl("g", { class: "overlay-station", transform: `translate(${point.x} ${point.y})`,
        role: "button", tabindex: 0, "aria-label": action, "data-stop-id": multiple ? null : stopId });
      const title = svgEl("title");
      title.textContent = action;
      const label = svgEl("text", { x: 0, y: 27, "text-anchor": "middle" });
      label.textContent = name;
      group.append(title, svgEl("circle", { r: 22, fill: "transparent" }),
        svgEl("circle", { r: multiple ? 7 : 5.5 }), label);
      bindMapButton(group, (keyboard) => callbacks.onStationClick?.(items, keyboard));
      groupStations.append(group);
    }
  }

  const drawLayerLine = (group, points, style, dash, className) => {
    const path = svgEl("path", {
      d: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
      fill: "none",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "stroke-dasharray": dash ?? null,
      class: className ?? null,
    });
    group.append(path);
    return path;
  };

  const drawRule = (group, points, style, dash) => {
    style.widths.forEach((strokeWidth, index) => {
      const path = drawLayerLine(group, points, style, dash);
      path.setAttribute("stroke", style.colors[index]);
      path.setAttribute("stroke-width", String(strokeWidth));
    });
  };

  const drawArrows = (lines, dashSkip) => {
    for (const line of lines) {
      const points = line.points.map(projected).filter(Boolean);
      if (points.length < 2 || dashSkip) continue;
      const total = pathLength(points);
      if (total < 46) continue;
      const interval = Math.max(80, Math.min(120, total / Math.max(1, Math.ceil(total / 100))));
      const arrows = [];
      for (let distance = 52; distance < total - 34; distance += interval) {
        const spot = pointAtDistance(points, distance);
        if (!spot) continue;
        arrows.push(spot);
      }
      for (const arrow of arrows) {
        const degree = (Math.atan2(arrow.dy, arrow.dx) * 180) / Math.PI;
        const group = svgEl("g", { transform: `translate(${arrow.x.toFixed(1)} ${arrow.y.toFixed(1)}) rotate(${degree.toFixed(1)})` });
        group.append(
          svgEl("path", {
            d: "M -5.4 -4.6 L 5.2 0 L -5.4 4.6",
            fill: "none",
            stroke: "#064c34",
            "stroke-width": "3.2",
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
          }),
          svgEl("path", {
            d: "M -5.4 -4.6 L 5.2 0 L -5.4 4.6",
            fill: "none",
            stroke: "#ffffff",
            "stroke-width": "2",
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
          })
        );
        groupArrows.append(group);
      }
    }
  };

  const altLines = (view.lines ?? []).filter((line) => line.role === "alt");
  const mainLines = (view.lines ?? []).filter((line) => line.role !== "alt" && line.points.length > 1);
  const previewLines = mainLines.filter((line) => line.role === "preview");

  for (const line of altLines) {
    const points = line.points.map(projected).filter(Boolean);
    if (points.length < 2) continue;
    drawRule(groupAlt, points, ROUTE_STYLE.alt, null);
    const hit = drawLayerLine(groupHits, points, ROUTE_STYLE.alt, null, "overlay-hit");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "24");
    hit.dataset.candidateId = line.candidateId;
    hit.dataset.legId = line.legId;
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.onLineClick?.(line.candidateId);
    });
  }

  for (const line of mainLines) {
    const points = line.points.map(projected).filter(Boolean);
    if (points.length < 2) continue;
    const style = ROUTE_STYLE[line.role] ?? ROUTE_STYLE.current;
    drawRule(groupMain, points, style, style.dash ?? null);
    const hit = drawLayerLine(groupHits, points, style, null, "overlay-hit");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "24");
    hit.dataset.candidateId = line.candidateId;
    hit.dataset.legId = line.legId;
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.onLineClick?.(line.candidateId);
    });
  }

  drawArrows(mainLines.filter((line) => line.role !== "preview"));

  const label = (x, y, text, options = {}) => {
    const fontSize = options.fontSize ?? 12;
    const weight = options.weight ?? "600";
    const widthEstimate = Math.max(16, textLength(text, fontSize) + 10);
    const height = fontSize + 8;
    const group = svgEl("g", { class: options.className ?? null });
    group.append(
      svgEl("rect", {
        x: (x - widthEstimate / 2).toFixed(1),
        y: (y - height / 2).toFixed(1),
        width: widthEstimate.toFixed(1),
        height: height.toFixed(1),
        rx: "4",
        class: "map-label-backing",
        opacity: options.backing === false ? "0" : "0.94",
      }),
      Object.assign(svgEl("text", { x: x.toFixed(1), y: (y + fontSize / 2 - 2).toFixed(1), "text-anchor": "middle", class: options.textClass ?? "map-label" }), {
        textContent: text,
      })
    );
    const textNode = group.lastElementChild;
    textNode.setAttribute("font-size", String(fontSize));
    textNode.setAttribute("font-weight", weight);
    groupLabels.append(group);
    return group;
  };

  for (const gap of view.gaps ?? []) {
    const point = projected(gap.coord);
    if (!point) continue;
    label(point.x, point.y, gap.text ?? "铁路轨迹暂不可用", { textClass: "map-gap-label", fontSize: 12, weight: "600" });
  }

  for (const marker of view.markers ?? []) {
    const point = projected(marker.coord);
    if (!point) continue;
    const group = svgEl("g", { class: "overlay-marker", transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})` });
    if (marker.nodeId !== undefined) group.dataset.nodeId = marker.nodeId;
    if (marker.nodeId !== undefined || marker.trainKey) {
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `查看${marker.stationName ?? marker.name ?? marker.cityName}`);
    }
    bindMapButton(group, () => {
      if (marker.trainKey) callbacks.onLineClick?.(marker.trainKey);
      else callbacks.onMarkerClick?.(marker.nodeId);
    });

    if (marker.kind === "start" || marker.kind === "end") {
      const isStart = marker.kind === "start";
      const drop = svgEl("path", {
        d: "M 0 0 C -3 -6 -15 -14 -15 -22 C -15 -30 -8 -36 0 -36 C 8 -36 15 -30 15 -22 C 15 -14 3 -6 0 0 Z",
        fill: isStart ? "#00856a" : "#c92e49",
        stroke: "#ffffff",
        "stroke-width": "3",
        "stroke-linejoin": "round",
      });
      const text = svgEl("text", { x: "0", y: "-19", class: "map-drop-text", "font-size": "14", "font-weight": "600" });
      text.textContent = isStart ? "起" : "终";
      group.append(drop, text);
      groupMarkers.append(group);
      const labelY = point.y - 46;
      label(point.x, labelY, marker.cityName, { fontSize: 12, weight: "600" });
      if (marker.stationName) {
        label(point.x, labelY - 18, marker.stationName, { fontSize: 11, weight: "400", textClass: "map-label map-label--muted" });
      } else if (marker.pendingStation) {
        label(point.x, labelY - 18, "待匹配车站", { fontSize: 11, weight: "400", textClass: "map-label map-label--muted" });
      }
      continue;
    }

    if (marker.kind === "waypoint") {
      group.append(
        svgEl("circle", { r: "16", fill: "#ffffff" }),
        svgEl("circle", { r: "13", fill: "#f2c94c", stroke: "#5f4b0b", "stroke-width": "1.5" })
      );
      const text = svgEl("text", { x: "0", y: "4.5", class: "map-waypoint-text", "font-size": "13", "font-weight": "600" });
      text.textContent = String(marker.index);
      group.append(text);
      groupMarkers.append(group);
      label(point.x + 6, point.y - 24, marker.cityName, { fontSize: 12, weight: "600", className: "map-city-label" });
      continue;
    }

    group.append(svgEl("circle", { r: "5.5", fill: "#ffffff", stroke: "#17212b", "stroke-width": "2", class: "map-station-dot" }));
    groupMarkers.append(group);
    label(point.x, point.y + 15, marker.name, { fontSize: 11, weight: "400", textClass: "map-label map-label--muted" });
  }

  const placePoint = view.place && projected(view.place.coord);
  if (isVisible(placePoint)) {
    const group = svgEl("g", { class: "overlay-place", transform: `translate(${placePoint.x} ${placePoint.y})`, "aria-hidden": "true" });
    group.append(
      svgEl("path", { d: "M0 0 C-3-5-11-11-11-18 A11 11 0 0 1 11-18 C11-11 3-5 0 0Z" }),
      svgEl("circle", { cy: "-18", r: "3.5" }));
    groupMarkers.append(group);
    label(placePoint.x, placePoint.y - 38, view.place.name, { fontSize: 12, weight: "600" });
  }
}

function textLength(text, fontSize) {
  let length = 0;
  for (const char of String(text)) {
    length += /[\u4e00-\u9fff]/.test(char) ? fontSize : fontSize * 0.58;
  }
  return length;
}

function pathLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

function pointAtDistance(points, distance) {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segment = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (segment === 0) continue;
    if (travelled + segment >= distance) {
      const ratio = (distance - travelled) / segment;
      return {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
        dx: current.x - previous.x,
        dy: current.y - previous.y,
      };
    }
    travelled += segment;
  }
  return null;
}

/* ---------- OfflineAdapter ---------- */

function createOfflineAdapter({ container, callbacks }) {
  let width = 0;
  let height = 0;
  let scale = 10;
  let center = [104, 35];
  let anchor = null;
  let svg = null;
  let overlay = null;
  let lastView = null;
  let dragging = null;
  let mounted = false;

  const project = (lng, lat) => ({
    x: (anchor?.x ?? width / 2) + (lng - center[0]) * scale,
    y: (anchor?.y ?? height / 2) - (lat - center[1]) * scale,
  });

  function normalizePadding(padding) {
    if (typeof padding === "number") return { top: padding, right: padding, bottom: padding, left: padding };
    return { top: 60, right: 60, bottom: 60, left: 60, ...(padding ?? {}) };
  }

  function redraw() {
    if (!svg) return;
    if (!lastView) {
      drawOverlay({ svg, view: { markers: [], lines: [], gaps: [] }, project, width, height, callbacks });
      return;
    }
    drawOverlay({ svg, view: lastView, project, width, height, callbacks, showDirectory: true, showStations: scale >= 160 });
  }

  function fitToBounds(points, padding = 80) {
    const pad = normalizePadding(padding);
    if (!points.length) {
      fitChina(pad);
      return;
    }
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const coord of points) {
      minLng = Math.min(minLng, coord[0]);
      maxLng = Math.max(maxLng, coord[0]);
      minLat = Math.min(minLat, coord[1]);
      maxLat = Math.max(maxLat, coord[1]);
    }
    const spanLng = Math.max(0.4, maxLng - minLng);
    const spanLat = Math.max(0.4, maxLat - minLat);
    const availableWidth = Math.max(120, width - pad.left - pad.right);
    const availableHeight = Math.max(120, height - pad.top - pad.bottom);
    scale = Math.min(availableWidth / spanLng, availableHeight / spanLat);
    scale = Math.max(0.5, Math.min(scale, 3000));
    center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
    anchor = { x: pad.left + availableWidth / 2, y: pad.top + availableHeight / 2 };
    redraw();
  }

  function fitChina(padding = 60) {
    fitToBounds(
      [CHINA_BOUNDS[0], [CHINA_BOUNDS[1][0], CHINA_BOUNDS[0][1]], CHINA_BOUNDS[1], [CHINA_BOUNDS[0][0], CHINA_BOUNDS[1][1]]],
      padding
    );
  }

  function updateSize() {
    width = container.clientWidth;
    height = container.clientHeight;
    if (svg) {
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
  }

  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest(".overlay-city, .overlay-station, .overlay-marker, .overlay-hit")) return;
    dragging = { x: event.clientX, y: event.clientY, center: [...center] };
    container.classList.add("dragging");
    container.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!dragging) return;
    center = [dragging.center[0] - (event.clientX - dragging.x) / scale, dragging.center[1] + (event.clientY - dragging.y) / scale];
    redraw();
  };
  const onPointerUp = () => {
    dragging = null;
    container.classList.remove("dragging");
  };
  const onWheel = (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.84 : 1.18;
    scale = Math.max(1.2, Math.min(scale * factor, 4000));
    redraw();
  };
  const onResize = () => {
    updateSize();
    redraw();
  };

  return {
    name: "offline",
    async mount() {
      container.classList.add("offline");
      overlay = createOverlay(container);
      svg = svgEl("svg", { class: "map-overlay" });
      overlay.append(svg);
      updateSize();
      fitChina(60);
      container.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      container.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("resize", onResize);
      mounted = true;
    },
    render(view) {
      lastView = view;
      redraw();
    },
    fit(padding, points = flattenBounds(lastView ?? { markers: [], lines: [], gaps: [] })) {
      fitToBounds(points, padding ?? 90);
    },
    fitCountry() {
      fitChina(60);
    },
    zoomIn() {
      scale = Math.min(scale * 1.45, 4000);
      redraw();
    },
    zoomOut() {
      scale = Math.max(scale / 1.45, 1.2);
      redraw();
    },
    resize: onResize,
    destroy() {
      if (!mounted) return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("wheel", onWheel);
      container.classList.remove("offline");
      overlay?.remove();
      mounted = false;
    },
  };
}

/* ---------- AmapAdapter ---------- */

function loadAmapSdk({ key, securityCode, version }) {
  return new Promise((resolve, reject) => {
    if (window.AMap && window.AMap.Map) {
      resolve(window.AMap);
      return;
    }
    window._AMapSecurityConfig = { securityJsCode: securityCode ?? "" };
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=${encodeURIComponent(version || "2.0")}&key=${encodeURIComponent(key)}&plugin=AMap.Scale`;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("AMap SDK 加载超时")), 9000);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.AMap?.Map) resolve(window.AMap);
      else reject(new Error("AMap SDK 不可用"));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("AMap SDK 加载失败"));
    };
    document.head.append(script);
  });
}

function createAmapAdapter({ container, config, callbacks, simulateFailure }) {
  let map = null;
  let overlay = null;
  let svg = null;
  let lastView = null;
  let width = 0;
  let height = 0;
  let scaleControl = null;
  let fitOverlay = null;
  let mapReady = false;
  let pendingFit = null;
  let readyTimer = 0;
  let adapterRef = null;
  const pendingHotspots = new Set();

  function cancelHotspots() {
    for (const timer of pendingHotspots) window.clearTimeout(timer);
    pendingHotspots.clear();
  }

  function markReady() {
    if (mapReady) return;
    mapReady = true;
    window.clearTimeout(readyTimer);
    redraw();
    flushPendingFit();
  }

  function flushPendingFit() {
    if (pendingFit === null) return;
    if (!adapterRef) {
      window.setTimeout(flushPendingFit, 100);
      return;
    }
    const { padding, points } = pendingFit;
    pendingFit = null;
    if (!points || lastView?.place?.coord === points[0]) adapterRef.fit(padding, points);
  }

  function normalizePadding(padding) {
    if (typeof padding === "number") return { top: padding, right: padding, bottom: padding, left: padding };
    return { top: 60, right: 60, bottom: 60, left: 60, ...(padding ?? {}) };
  }

  function project(lng, lat) {
    if (!map) return null;
    const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
    const pixel = map.lngLatToContainer(new window.AMap.LngLat(gcjLng, gcjLat));
    if (!pixel) return null;
    return { x: pixel.getX ? pixel.getX() : pixel.x, y: pixel.getY ? pixel.getY() : pixel.y };
  }

  function redraw() {
    if (!svg || !map) return;
    width = container.clientWidth;
    height = container.clientHeight;
    if (lastView) {
      drawOverlay({ svg, view: lastView, project, width, height, callbacks });
    }
  }

  function boundsOf(points) {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const coord of points) {
      minLng = Math.min(minLng, coord[0]);
      maxLng = Math.max(maxLng, coord[0]);
      minLat = Math.min(minLat, coord[1]);
      maxLat = Math.max(maxLat, coord[1]);
    }
    return { minLng, maxLng, minLat, maxLat };
  }

  return (adapterRef = {
    name: "amap",
    async mount() {
      if (simulateFailure?.failNext) {
        // ?mapfail=1：只让下一次加载失败，点“重试”后走真实加载，用于验证故障恢复。
        simulateFailure.failNext = false;
        throw new Error("模拟底图加载失败");
      }
      const AMap = await loadAmapSdk({ key: config.jsApiKey, securityCode: config.securityCode, version: config.mapVersion });
      width = container.clientWidth;
      height = container.clientHeight;
      map = new AMap.Map(container, {
        zoom: 4,
        center: [104, 35],
        mapStyle: "amap://styles/whitesmoke",
        viewMode: "2D",
        dragRotate: false,
        resizeEnable: true,
        isHotspot: true,
      });
      map.on("hotspotclick", ({ name, lnglat, originEvent }) => {
        if (typeof name !== "string" || !lnglat || originEvent?.detail > 1) return;
        // 高德先报告热点单击，再识别后续双击缩放。
        const timer = window.setTimeout(() => {
          pendingHotspots.delete(timer);
          callbacks.onHotspotClick?.(name.trim(), (longitude, latitude) =>
            lnglat.distance(new AMap.LngLat(...wgs84ToGcj02(longitude, latitude))));
        }, 500);
        pendingHotspots.add(timer);
      });
      map.on("dblclick", cancelHotspots);
      map.on("dragstart", cancelHotspots);
      map.on("zoomstart", cancelHotspots);
      map.on("complete", () => markReady());
      map.on("moveend", () => redraw());
      map.on("zoomend", () => redraw());
      readyTimer = window.setTimeout(() => markReady(), 4000);
      try {
        scaleControl = new AMap.Scale({ position: "RB" });
        map.addControl(scaleControl);
      } catch {
        /* 比例尺不可用时保持默认署名，不影响路线绘制 */
      }
      overlay = createOverlay(container);
      svg = svgEl("svg", { class: "map-overlay" });
      overlay.append(svg);
      container.classList.add("amap-ready");
    },
    render(view) {
      lastView = view;
      redraw();
    },
    fit(padding, points) {
      if (!map) return;
      if (!mapReady) {
        pendingFit = { padding, points };
        return;
      }
      points ??= flattenBounds(lastView ?? { markers: [], lines: [], gaps: [] });
      if (!points.length) return;
      const pad = normalizePadding(padding);
      const { minLng, maxLng, minLat, maxLat } = boundsOf(points);
      const spanLng = Math.max(0.4, maxLng - minLng);
      const spanLat = Math.max(0.4, maxLat - minLat);
      const boundsCenterLng = (minLng + maxLng) / 2;
      const boundsCenterLat = (minLat + maxLat) / 2;
      const availableWidth = Math.max(200, width - pad.left - pad.right);
      const availableHeight = Math.max(160, height - pad.top - pad.bottom);
      const cosLat = Math.max(0.2, Math.cos((boundsCenterLat * Math.PI) / 180));
      const zoomLng = Math.log2((360 * availableWidth) / (spanLng * 256));
      const zoomLat = Math.log2((360 * cosLat * availableHeight) / (spanLat * 256));
      const zoom = Math.max(3, Math.min(17, Math.floor(Math.min(zoomLng, zoomLat))));
      const [gcjCenterLng, gcjCenterLat] = wgs84ToGcj02(boundsCenterLng, boundsCenterLat);
      map.setZoomAndCenter(zoom, [gcjCenterLng, gcjCenterLat], true);
      const actualZoom = typeof map.getZoom === "function" ? map.getZoom() : zoom;
      const pxPerDegLon = (256 * Math.pow(2, actualZoom)) / 360;
      const pxPerDegLat = pxPerDegLon / cosLat;
      const desiredX = pad.left + availableWidth / 2;
      const desiredY = pad.top + availableHeight / 2;
      const centerLng = boundsCenterLng - (desiredX - width / 2) / pxPerDegLon;
      const centerLat = boundsCenterLat + (desiredY - height / 2) / pxPerDegLat;
      const [gcjLng, gcjLat] = wgs84ToGcj02(centerLng, centerLat);
      map.setCenter?.([gcjLng, gcjLat], true);
      redraw();
    },
    fitCountry() {
      pendingFit = null;
      if (!map) return;
      const [lng, lat] = wgs84ToGcj02(104, 35);
      map.setZoomAndCenter(4, [lng, lat]);
      redraw();
    },
    zoomIn() {
      map?.zoomIn();
    },
    zoomOut() {
      map?.zoomOut();
    },
    resize() {
      map?.resize?.();
      redraw();
    },
    destroy() {
      cancelHotspots();
      overlay?.remove();
      fitOverlay?.setMap?.(null);
      fitOverlay = null;
      if (scaleControl) map?.removeControl?.(scaleControl);
      map?.destroy?.();
      map = null;
      svg = null;
      overlay = null;
    },
  });
}

/* ---------- 控制器：选择适配器、共用渲染与降级 ---------- */

export async function initMapController({ container, sourceEl, noticeEl, config, forceMode, simulateFailure, callbacks }) {
  let adapter = null;
  let kind = "offline";
  let state = "loading";
  let degraded = false;
  let lastPadding = null;
  let placePadding = null;

  function setSource(text) {
    if (sourceEl) sourceEl.textContent = text;
  }

  function setNotice(text, options = {}) {
    if (!noticeEl) return;
    noticeEl.replaceChildren();
    if (!text) {
      noticeEl.hidden = true;
      return;
    }
    noticeEl.hidden = false;
    const span = document.createElement("span");
    span.textContent = text;
    noticeEl.append(span);
    if (options.retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-secondary";
      button.style.minHeight = "36px";
      button.style.marginLeft = "12px";
      button.textContent = "重试";
      button.addEventListener("click", options.retry);
      noticeEl.append(button);
    }
  }

  async function mountOffline({ degraded: isDegraded }) {
    adapter?.destroy?.();
    kind = "offline";
    degraded = Boolean(isDegraded);
    state = degraded ? "degraded" : "ready";
    container.replaceChildren();
    container.classList.remove("amap-ready");
    adapter = createOfflineAdapter({ container, callbacks });
    await adapter.mount();
    if (degraded) {
      // 底图失败时隐藏轨迹与标记：离线画布上的折线不能当作真实底图证据。
      adapter.render({ markers: [], lines: [], gaps: [] });
      setSource("底图未加载 · 已隐藏轨迹");
      callbacks.onState?.({ status: state, adapter: kind, notice: "底图未加载" });
      setNotice("底图未加载", { retry: () => restart() });
    } else {
      setSource("底图未加载 · 经纬度等距投影（未接入底图服务）");
      callbacks.onState?.({ status: state, adapter: kind, notice: null });
      setNotice(null);
    }
  }

  async function start() {
    if (config.jsApiKey && forceMode !== "offline") {
      try {
        // 从离线降级恢复时，先销毁旧适配器：否则 pointer/wheel/resize 监听器与 offline class 残留。
        adapter?.destroy?.();
        adapter = null;
        container.replaceChildren();
        container.classList.remove("offline");
        state = "loading";
        setSource("正在加载底图");
        adapter = createAmapAdapter({ container, config, simulateFailure, callbacks });
        await adapter.mount();
        kind = "amap";
        degraded = false;
        state = "ready";
        setSource("© 高德地图");
        setNotice(null);
        callbacks.onState?.({ status: state, adapter: kind, notice: null });
        return;
      } catch (error) {
        if (adapter) {
          try {
            adapter.destroy?.();
          } catch {
            /* 忽略销毁异常 */
          }
          adapter = null;
        }
        container.replaceChildren();
        await mountOffline({ degraded: true });
        return;
      }
    }
    await mountOffline({ degraded: false });
  }

  async function restart() {
    setNotice(null);
    await start();
    if (lastView) renderView();
    if (placePadding !== null && lastView?.place) adapter?.fit(placePadding, [lastView.place.coord]);
    else if (!degraded && lastPadding !== null) adapter?.fit(lastPadding);
  }

  let lastView = null;

  function renderView() {
    adapter?.render(degraded ? { place: lastView.place } : lastView);
  }

  await start();

  return {
    get adapterName() {
      return kind;
    },
    get status() {
      return state;
    },
    get degraded() {
      return degraded;
    },
    render(view) {
      lastView = view;
      if (!view.place) placePadding = null;
      renderView();
    },
    locatePlace(padding) {
      if (!lastView?.place) return;
      placePadding = padding;
      adapter?.fit(padding, [lastView.place.coord]);
    },
    fit(padding) {
      placePadding = null;
      lastPadding = padding;
      adapter?.fit(padding);
    },
    fitCountry() {
      placePadding = null;
      adapter?.fitCountry?.();
    },
    zoomIn() {
      adapter?.zoomIn();
    },
    zoomOut() {
      adapter?.zoomOut();
    },
    resize() {
      adapter?.resize();
    },
    destroy() {
      adapter?.destroy();
    },
    retry() {
      restart();
    },
  };
}

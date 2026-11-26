/* 统一城市行程。所有选站、时刻和区间结果均以历史回放 API 为准。 */
import config from "./config.js";
import { createApi, errorText } from "./api.js";
import { gcj02ToWgs84, initMapController } from "./map.js";
import { closeModal, el, ICONS, openModal } from "./ui.js";

const $ = (selector) => document.querySelector(selector);
const api = createApi({ live: true });
const panel = $("#workspace-panel");
const itinerary = $("#itinerary");
const results = $("#replay-results");
const status = $("#query-status");
const search = $("#location-search");
const suggestions = $("#location-results");
const placeSearch = $("#place-search");
const placeStatus = $("#place-status");
const placeResults = $("#place-results");
const placeDetails = $("#place-details");
const departure = $("#departure-date");
const reference = $("#reference-date");
const transfer = $("#transfer-minutes");
const toggle = $("#panel-toggle");
const nodes = [];
const stationLists = new Map();
const stations = new Map();
const cities = new Map();
let catalogStations = [];
let context;
let map;
let nextNodeId = 1;
let plan;
let geometry = new Map();
let planRequest;
let searchRequest;
let placeRequest;
let selectedPlace;
let searchTimer;
let composingSearch = false;
let selectedTrain;

const coordinate = ({ longitude, latitude }) => [longitude, latitude];
const cityLabel = ({ name, administration }) => name === administration ? name : `${name} · ${administration}`;
const stationLabel = (city, station) => `${station.stopName}（${station.stopId}） · ${cityLabel(city)}`;
const hotspotStationRadiusMeters = 1500;
const stripStationSuffix = (name) => name.replace(/(?:火车)?站$/, "");
const button = (text, action, attrs = {}) =>
  el("button", { class: "button button-secondary", text, attrs: { type: "button", ...attrs }, on: { click: action } });
const clock = (dateTime) => dateTime.slice(0, 16).replace("T", " ");
const trainKey = (leg, index) => `${leg.index}-${index}`;
const minutes = (seconds) => Number((seconds / 60).toFixed(2));
const geometryReasons = {
  NO_SHAPE: "源数据缺少轨迹",
  INVALID_SHAPE: "源轨迹无效",
  INVALID_STATION_COORDINATE: "站点坐标无效",
  BOUNDARY_UNRESOLVED: "无法匹配铁路区间边界",
  BOUNDARY_AMBIGUOUS: "铁路区间边界有多个匹配",
};

function setCollapsed(collapsed) {
  panel.dataset.compact = String(collapsed);
  $("#panel-body").hidden = collapsed;
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.textContent = collapsed ? `展开行程（${nodes.length} 城）` : "收起行程";
}

function focusCard(card, control) {
  const target = control && card?.querySelector(`[data-control="${control}"]:not(:disabled)`);
  (target || card)?.focus();
}

function focusNode(nodeId, control) {
  setCollapsed(false);
  focusCard(document.getElementById(`visit-${nodeId}`), control);
}

function editNodes(focusId, control) {
  renderNodes();
  recalculate();
  if (focusId) focusNode(focusId, control);
}

function addCity(city, station) {
  const node = { id: nextNodeId++, city, arrivalStopId: station?.stopId, departureStopId: station?.stopId };
  nodes.push(node);
  if (station) stations.set(station.stopId, station);
  editNodes();
  if (!stationLists.has(city.cityId)) loadStations(city.cityId);
}

function mapFocusTarget() {
  return panel.dataset.compact === "true" ? toggle : search;
}

function addMapLocation(city, station, keyboard) {
  const existing = nodes.find((node, index) => node.city.cityId === city.cityId && (!station ||
    (index > 0 && node.arrivalStopId === station.stopId) ||
    ((index === 0 || index < nodes.length - 1) && node.departureStopId === station.stopId)));
  if (existing) {
    focusNode(existing.id);
    return;
  }
  addCity(city, station);
  if (keyboard) mapFocusTarget().focus();
}

function chooseMapStation(matches, keyboard) {
  if (matches.length === 1) {
    const { cityId, station } = matches[0];
    addMapLocation(cities.get(cityId), station, keyboard);
    return;
  }
  const choices = matches.map(({ cityId, station }) => {
    const city = cities.get(cityId);
    return el("li", {}, button(stationLabel(city, station), () => {
      closeModal({ restoreFocus: false });
      addMapLocation(city, station, true);
    }));
  });
  openModal({ title: "选择铁路站", previousFocus: mapFocusTarget(), initialFocus: choices[0].firstElementChild,
    body: el("ul", { class: "replay-matches" }, choices) });
}

function pickHotspot(name, distanceTo) {
  if (!name.endsWith("站")) {
    const cityName = name.replace(/市$/, "");
    const matches = [...cities.values()].filter((city) => city.name.replace(/市$/, "") === cityName);
    if (matches.length === 1) addMapLocation(matches[0]);
    return;
  }

  const stationName = stripStationSuffix(name);
  const matches = catalogStations.filter(({ station }) => stripStationSuffix(station.stopName) === stationName &&
    distanceTo(...coordinate(station)) <= hotspotStationRadiusMeters);
  if (matches.length) chooseMapStation(matches);
}

async function loadStations(cityId) {
  stationLists.set(cityId, { loading: true });
  renderNodes();
  const response = await api.replayCity(context.dataset.version, cityId);
  const items = response.data?.item.stations.map(({ station }) => station);
  stationLists.set(cityId, { items, error: response.error });
  for (const station of items ?? []) stations.set(station.stopId, station);
  renderNodes();
  renderMap();
}

function stationSelect(node, field, title, options) {
  const select = el("select", {
    class: "date-input",
    attrs: { "aria-label": `${node.city.name}${title}`, disabled: !options, "data-control": field },
    on: { change: ({ target }) => {
      node[field] = target.value || undefined;
      recalculate();
    } },
  }, el("option", { text: "自动选站", attrs: { value: "" } }));
  const known = stations.get(node[field]);
  for (const station of options ?? (known ? [known] : [])) {
    select.append(el("option", { text: `${station.stopName}（${station.stopId}）`, attrs: { value: station.stopId } }));
  }
  select.value = node[field] ?? "";
  return el("label", { class: "field" }, el("span", { class: "field-label", text: title }), select);
}

function renderNodes() {
  const focus = document.activeElement?.closest(".replay-node");
  const control = document.activeElement?.dataset.control;
  itinerary.replaceChildren(...nodes.map((node, index) => {
    const first = index === 0;
    const last = index === nodes.length - 1;
    const role = first ? "起点" : last ? "终点" : "停留";
    const entry = stationLists.get(node.city.cityId);
    const move = (offset, action) => {
      const neighbor = nodes[index + offset];
      nodes[index + offset] = node;
      nodes[index] = neighbor;
      editNodes(node.id, action);
    };
    const actionButton = (icon, title, action, disabled) => el("button", {
      class: "icon-button", html: ICONS[icon],
      attrs: { type: "button", "aria-label": `${title}${node.city.name}`, title, disabled, "data-control": icon },
      on: { click: action },
    });
    const card = el("li", { class: "replay-node", attrs: { id: `visit-${node.id}`, tabindex: "-1" } },
      el("div", { class: "replay-node-head" },
        el("div", {}, el("strong", { text: node.city.name }), el("span", { class: "replay-role", text: role })),
        el("div", { class: "replay-node-actions" },
          actionButton("arrowUp", "上移", () => move(-1, "arrowUp"), first),
          actionButton("arrowDown", "下移", () => move(1, "arrowDown"), last),
          actionButton("trash", "移除", () => {
            nodes.splice(index, 1);
            editNodes((nodes[index] ?? nodes.at(-1))?.id, "trash");
            if (!nodes.length) search.focus();
          }))),
      el("div", { class: "replay-node-stations" },
        !first && stationSelect(node, "arrivalStopId", "到站", entry?.items),
        (!last || first) && stationSelect(node, "departureStopId", "发站", entry?.items)));
    if (!first && !last) {
      const stay = el("input", {
        class: "date-input", attrs: { type: "number", min: 1, max: 2147483647, step: 1, required: true,
          value: node.stayDays ?? 1, "aria-label": `${node.city.name}停留天数`, "data-control": "stay" },
        on: { change: ({ target }) => {
          node.stayDays = target.valueAsNumber;
          recalculate();
        } },
      });
      card.querySelector(".replay-node-stations").append(
        el("label", { class: "field" }, el("span", { class: "field-label", text: "停留天数" }), stay));
      if (Number.isNaN(node.stayDays)) stay.value = "";
    }
    if (entry?.error) card.append(button("重试加载车站", () => loadStations(node.city.cityId)));
    return card;
  }));
  if (focus?.id) {
    focusCard(document.getElementById(focus.id), control);
  }
  if (panel.dataset.compact === "true") setCollapsed(true);
}

function clearSearchResults() {
  clearTimeout(searchTimer);
  searchRequest?.abort();
  suggestions.replaceChildren();
  placeRequest?.abort();
  placeSearch.disabled = false;
  placeSearch.hidden = true;
  placeStatus.textContent = "";
  placeStatus.classList.remove("field-error");
  placeResults.replaceChildren();
  clearSelectedPlace();
}

function queueSearch() {
  clearSearchResults();
  const term = search.value.trim();
  if (term) {
    placeSearch.hidden = false;
    searchTimer = setTimeout(() => findLocations(term, 0), 180);
  }
}

async function findLocations(term, offset, association) {
  const input = association?.input ?? search;
  const target = association?.results ?? suggestions;
  (association ? association.request : searchRequest)?.abort();
  const request = new AbortController();
  if (association) association.request = request;
  else searchRequest = request;
  const isCurrent = () => !request.signal.aborted && input.value.trim() === term &&
    (!association || selectedPlace === association);
  const more = target.querySelector(".replay-more");
  if (more) (more.querySelector("button") ?? more).disabled = true;
  const response = await api.replayLocations(context.dataset.version, term, offset, request.signal);
  if (!isCurrent()) return;
  more?.remove();
  if (!response.ok) {
    const retry = button("重试搜索", () => findLocations(term, offset, association));
    const feedback = el("div", { class: "replay-more" },
      el("p", { class: "field-error", text: errorText(response.error), attrs: { role: "status" } }), retry);
    target.append(feedback);
    if (offset) retry.focus();
    return;
  }
  const { items, hasMore } = response.data;
  if (!items.length && !offset) {
    target.append(el("p", { text: association ? "没有匹配的本地城市或铁路站，请换个关键词。" : "没有匹配的城市或车站。",
      attrs: { role: "status" } }));
    return;
  }
  let firstNewMatch;
  for (const [type, heading] of [["CITY", "城市"], ["STATION", "铁路站"]]) {
    const matches = items.filter((item) => item.type === type);
    if (!matches.length) continue;
    let list = target.querySelector(`[data-location-type="${type}"]`);
    if (!list) {
      list = el("ul", { class: "replay-matches", dataset: { locationType: type },
        attrs: { id: association ? null : `location-${type.toLowerCase()}-matches`, "aria-label": heading } });
      target.append(el("section", { class: "replay-match-group" }, el("h2", { text: heading }), list));
    }
    for (const { city, station } of matches) {
      const stop = station?.station;
      const text = stop ? stationLabel(city, stop) : cityLabel(city);
      const match = button(text, () => {
        if (!target.contains(match) || input.value.trim() !== term || (association && selectedPlace !== association)) return;
        if (association) {
          association.choice?.button.setAttribute("aria-pressed", "false");
          association.choice = { city, stop, button: match };
          match.setAttribute("aria-pressed", "true");
          association.selection.textContent = `待确认：${text}`;
          association.confirm.disabled = placeSearch.disabled;
          return;
        }
        search.value = "";
        clearSearchResults();
        addCity(city, stop);
        search.focus();
      }, association ? { "aria-pressed": "false" } : {});
      match.classList.add("replay-match");
      firstNewMatch ??= match;
      list.append(el("li", {}, match));
    }
  }
  if (hasMore) {
    const next = button("更多结果", () => findLocations(term, offset + items.length, association));
    next.classList.add("replay-more");
    target.append(next);
  }
  if (offset) firstNewMatch?.focus();
}

const placeAddress = ({ city, district, address }) => [city, district, address].filter(Boolean).join(" · ");

function clearSelectedPlace() {
  if (!selectedPlace) return;
  selectedPlace.request?.abort();
  selectedPlace = undefined;
  placeDetails.hidden = true;
  placeDetails.replaceChildren();
  renderMap();
}

function showPlace(place, resultButton) {
  clearSelectedPlace();
  const title = el("h2", { text: place.name, attrs: { tabindex: "-1" } });
  const choices = el("div", { class: "replay-search-results" });
  const selection = el("p", { class: "field-hint", attrs: { role: "status" } });
  const confirm = button("确认并加入行程", () => {
    if (selectedPlace !== association || !association.choice || placeSearch.disabled) return;
    const { city, stop } = association.choice;
    dismissSearch();
    addCity(city, stop);
  }, { disabled: true });
  confirm.classList.replace("button-secondary", "button-primary");
  const clearChoices = () => {
    association.request?.abort();
    association.choice = undefined;
    confirm.disabled = true;
    selection.textContent = "";
    choices.replaceChildren();
  };
  const input = el("input", {
    class: "date-input",
    attrs: { type: "search", id: "place-association-search", value: place.city ?? "", autocomplete: "off",
      required: true, maxlength: 64, placeholder: "输入本地城市、站名或站码" },
    on: {
      input: clearChoices,
      compositionstart: () => {
        association.composing = true;
        clearChoices();
      },
      compositionend: () => { association.composing = false; },
    },
  });
  const runSearch = () => {
    if (association.composing) return;
    clearChoices();
    const term = input.value.trim();
    if (!term) return;
    choices.append(el("p", { class: "replay-more field-hint", text: "正在查询本地城市和铁路站…", attrs: { role: "status" } }));
    findLocations(term, 0, association);
  };
  const submit = el("button", { class: "button button-secondary", text: "查找", attrs: { type: "submit" } });
  const form = el("form", { on: { submit: (event) => { event.preventDefault(); runSearch(); } } },
    el("label", { class: "field-label", text: "关联本地城市或铁路站", attrs: { for: input.id } }),
    el("div", { class: "replay-place-search" }, input, submit));
  const close = () => {
    clearSelectedPlace();
    (resultButton.isConnected ? resultButton : search).focus();
  };
  const association = { place, coord: gcj02ToWgs84(...coordinate(place)), input, results: choices, selection, confirm };
  selectedPlace = association;
  placeDetails.hidden = false;
  placeDetails.append(
    el("div", { class: "replay-place-heading" }, title,
      el("button", { class: "icon-button", html: ICONS.close, attrs: { type: "button", "aria-label": "关闭地点详情" },
        on: { click: close } })),
    el("p", { class: "field-hint", text: placeAddress(place) || "地址未提供" }),
    el("p", { class: "field-hint", text: `高德地点 · ${place.poiId}` }),
    form, choices, selection, confirm);
  title.focus();
  renderMap();
  map?.locatePlace(mapPadding());
  if (input.value) runSearch();
}

async function findPlaces() {
  const term = search.value.trim();
  if (!term || placeSearch.disabled) return;
  const request = new AbortController();
  placeRequest = request;
  placeSearch.disabled = true;
  const oldMatches = placeResults.querySelectorAll(".replay-match");
  for (const match of oldMatches) match.disabled = true;
  if (selectedPlace) selectedPlace.confirm.disabled = true;
  placeStatus.classList.remove("field-error");
  placeStatus.textContent = "正在查询高德地点…";
  const response = await api.searchAmapPlaces(term, request.signal);
  if (request.signal.aborted || search.value.trim() !== term) return;
  placeSearch.disabled = false;
  if (selectedPlace) selectedPlace.confirm.disabled = !selectedPlace.choice;
  if (!response.ok) {
    for (const match of oldMatches) match.disabled = false;
    placeStatus.classList.add("field-error");
    placeStatus.textContent = errorText(response.error);
    return;
  }
  const { items } = response.data;
  if (selectedPlace && !items.some((place) => Object.keys(selectedPlace.place).every((key) => place[key] === selectedPlace.place[key]))) {
    const focusedDetails = placeDetails.contains(document.activeElement);
    clearSelectedPlace();
    if (focusedDetails) placeSearch.focus();
  }
  placeStatus.textContent = items.length ? "高德地点" : "没有找到匹配的高德地点。";
  placeResults.replaceChildren();
  if (!items.length) return;
  const labels = items.map((place) => `${place.name} · ${placeAddress(place)}`);
  placeResults.append(el("ul", { class: "replay-matches", attrs: { "aria-label": "高德地点" } },
    items.map((place, index) => {
      const label = [placeAddress(place), labels.indexOf(labels[index]) !== labels.lastIndexOf(labels[index]) && place.poiId]
        .filter(Boolean).join(" · ");
      const match = button("", () => {
        if (!placeSearch.disabled && placeResults.contains(match) && search.value.trim() === term) showPlace(place, match);
      });
      match.classList.add("replay-match", "replay-place-result");
      match.append(el("strong", { text: place.name }), label && el("span", { class: "field-hint", text: label }));
      return el("li", {}, match);
    })));
}

async function recalculate() {
  planRequest?.abort();
  plan = undefined;
  geometry = new Map();
  selectedTrain = undefined;
  renderResults();
  renderMap();
  if (!context || nodes.length < 2) {
    if (context) status.textContent = nodes.length ? "再添加一个城市即可规划行程。" : "";
    return;
  }
  if (!departure.validity.valid || !reference.validity.valid ||
      departure.value.length !== 10 || reference.value.length !== 10) {
    status.textContent = "请填写有效的出发日期和参考自然日。";
    return;
  }
  if (!transfer.validity.valid) {
    status.textContent = "请填写最短换乘间隔，行程将自动计算。";
    return;
  }
  if (itinerary.querySelector("input:invalid")) {
    status.textContent = "请为每个停留城市填写有效的停留天数。";
    return;
  }
  const request = new AbortController();
  planRequest = request;
  status.textContent = "正在计算行程…";
  const response = await api.replayPlan({
    datasetVersion: context.dataset.version,
    departureDate: departure.value,
    referenceDate: reference.value,
    minimumTransferMinutes: transfer.valueAsNumber,
    nodes: nodes.map(({ city, arrivalStopId, departureStopId, stayDays }, index) => ({
      cityId: city.cityId, arrivalStopId, departureStopId,
      stayDays: index > 0 && index < nodes.length - 1 ? stayDays : undefined,
    })),
  }, request.signal);
  if (request.signal.aborted) return;
  if (!response.ok) {
    status.textContent = errorText(response.error);
    status.append(" ", button("重试", recalculate));
    return;
  }
  plan = response.data;
  status.textContent = plan.emptyReason ? "部分行程未匹配。" : "行程已匹配，以下时间为北京时间。";
  renderResults();
  renderMap();
  const requests = plan.legs.flatMap((leg) => leg.trains.map(async ({ trip, referenceServiceDate }, index) => {
    const entry = await api.loadGeometry({
      datasetVersion: context.dataset.version,
      tripId: trip.tripId, referenceServiceDate,
      fromStopId: trip.from.stopId, toStopId: trip.to.stopId,
      boardSequence: trip.boardSequence, alightSequence: trip.alightSequence,
    }, request.signal);
    return [trainKey(leg, index), entry.ok ? entry.data : { status: "ERROR", error: entry.error }];
  }));
  const shapes = await Promise.all(requests);
  if (request.signal.aborted) return;
  geometry = new Map(shapes);
  renderGeometryStatuses();
  renderMap();
}

function renderGeometryStatuses() {
  for (const label of results.querySelectorAll("[data-geometry]")) {
    const shape = geometry.get(label.dataset.geometry);
    label.textContent = !shape ? "正在读取铁路轨迹…" : shape.status === "READY" && shape.points?.length > 1
      ? shape.accuracy === "APPROXIMATE" ? "铁路轨迹（近似截取）" : "铁路轨迹可用"
      : shape.status === "ERROR" ? `轨迹加载失败（${errorText(shape.error)}）`
        : `铁路轨迹缺失${geometryReasons[shape.reason] ? `（${geometryReasons[shape.reason]}）` : ""}`;
  }
}

function renderResults() {
  results.replaceChildren();
  if (!plan) return;
  for (let index = 0; index < nodes.length - 1; index++) {
    const leg = plan.legs[index];
    const section = el("section", { class: "replay-leg" },
      el("h2", { text: `${nodes[index].city.name} → ${nodes[index + 1].city.name}` }));
    results.append(section);
    if (!leg) {
      const message = index !== plan.failedLegIndex ? "等待前段匹配"
        : plan.emptyReason === "DATE_OUTSIDE_COVERAGE" ? "续程超出参考日期覆盖范围" : "未找到可行铁路区间";
      section.append(el("p", { class: "field-error", text: message }));
      continue;
    }
    if (index > 0) section.append(el("p", { class: "replay-connection", text: `停留 ${plan.nodes[index].stayDays} 天后续程` }));
    leg.trains.forEach((train, trainIndex) => {
      const { trip } = train;
      const key = trainKey(leg, trainIndex);
      if (trainIndex > 0) {
        const arrival = leg.trains[trainIndex - 1].trip.to;
        const connection = leg.connections?.[trainIndex - 1];
        const city = cities.get(train.fromCityId)?.name ?? "";
        const text = connection?.crossStation
          ? `${city}跨站换乘 · ${arrival.stopName} → ${trip.from.stopName} · 可用 ${minutes(connection.availableSeconds)} 分钟，接驳 ${minutes(connection.transferSeconds)} 分钟，额外缓冲 ${minutes(connection.bufferSeconds)} 分钟（${connection.source}）`
          : `${city}换乘 · ${trip.from.stopName}`;
        section.append(el("p", { class: "replay-connection", text }));
      }
      section.append(el("div", { class: "replay-train", attrs: { id: `train-${key}`, tabindex: "-1" } },
        el("strong", { text: trip.trainName }),
        el("p", { text: `${trip.from.stopName}（${trip.from.stopId}） ${clock(train.departureDateTime)} → ${trip.to.stopName}（${trip.to.stopId}） ${clock(train.arrivalDateTime)}` }),
        el("p", { class: "field-hint", dataset: { geometry: key } })));
    });
  }
  renderGeometryStatuses();
}

function renderMap() {
  if (!map) return;
  const markers = [];
  const lines = [];
  nodes.forEach((node, index) => {
    const first = index === 0;
    const last = index === nodes.length - 1;
    const arrival = plan?.legs[index - 1]?.trains.at(-1)?.toStation ?? stations.get(node.arrivalStopId);
    const departure = plan?.legs[index]?.trains[0]?.fromStation ?? stations.get(node.departureStopId);
    const station = first ? departure : last ? arrival : null;
    markers.push({
      kind: first ? "start" : last ? "end" : "waypoint",
      coord: coordinate(station ?? node.city),
      nodeId: node.id, cityName: node.city.name, stationName: station?.stopName, stopId: station?.stopId,
      pendingStation: !station, index: index + 1,
    });
    if (!first && !last) {
      for (const station of [arrival, departure?.stopId === arrival?.stopId ? null : departure]) {
        if (station) markers.push({ kind: "station", coord: coordinate(station), name: station.stopName,
          stopId: station.stopId, nodeId: node.id });
      }
    }
  });
  for (const leg of plan?.legs ?? []) {
    leg.trains.forEach((train, index) => {
      const key = trainKey(leg, index);
      const shape = geometry.get(key);
      if (shape?.status === "READY" && shape.points.length > 1) {
        lines.push({ key, candidateId: key, role: key === selectedTrain ? "selected" : "current", points: shape.points });
      }
      if (index > 0) {
        const previous = leg.trains[index - 1];
        const connection = leg.connections[index - 1];
        const transferStops = connection.crossStation ? [previous.toStation, train.fromStation] : [train.fromStation];
        for (const station of transferStops) {
          markers.push({ kind: "station", coord: coordinate(station), name: station.stopName, stopId: station.stopId, trainKey: key });
        }
      }
    });
  }
  const selected = new Set(nodes.map(({ city }) => city.cityId));
  const place = selectedPlace && { name: selectedPlace.place.name, coord: selectedPlace.coord };
  map.render({ markers, lines, gaps: [], catalogStations, place,
    cities: [...cities.values()].filter(({ cityId }) => !selected.has(cityId)) });
}

function mapPadding() {
  const rect = panel.getBoundingClientRect();
  return window.matchMedia("(max-width: 767px)").matches
    ? { top: rect.bottom + 16, left: 16, right: 48, bottom: 48 }
    : { left: rect.right + 24, top: 84, right: 80, bottom: 56 };
}

async function loadContext() {
  status.textContent = "正在读取历史数据…";
  const response = await api.loadContext();
  if (!response.ok) {
    status.textContent = errorText(response.error);
    status.append(" ", button("重试", loadContext));
    return;
  }
  context = response.data;
  const { version, coverageStart, coverageEnd } = context.dataset;
  $("#dataset-summary").textContent = `历史回放 · ${version}`;
  departure.value = reference.value = context.defaultReferenceServiceDate;
  reference.min = coverageStart;
  reference.max = coverageEnd;
  if (context.dataset.warnings?.length) {
    const details = $("#dataset-warnings");
    details.hidden = false;
    details.append(el("ul", {}, context.dataset.warnings.map((warning) => el("li", { text: warning }))));
  }
  status.textContent = "";
  search.disabled = false;
  recalculate();
  await loadCities();
}

async function loadCities() {
  const directory = await api.replayCities(context.dataset.version);
  const notice = $("#city-directory-status");
  if (!directory.ok) {
    notice.textContent = "地图城市加载失败。";
    notice.append(" ", button("重试加载城市", loadCities));
    return;
  }
  notice.replaceChildren();
  directory.data.items.sort((a, b) => b.stationCount - a.stationCount)
    .forEach((city) => cities.set(city.cityId, city));
  renderMap();
  await loadMapStations();
}

async function loadMapStations() {
  const notice = $("#city-directory-status");
  notice.replaceChildren();
  const directory = await api.replayStations(context.dataset.version);
  if (!directory.ok) {
    notice.textContent = "地图铁路站加载失败。";
    notice.append(" ", button("重试加载铁路站", loadMapStations));
    return;
  }
  catalogStations = directory.data.items;
  renderMap();
}

toggle.addEventListener("click", () => setCollapsed(toggle.getAttribute("aria-expanded") === "true"));
for (const input of [departure, reference, transfer]) input.addEventListener("change", recalculate);
search.addEventListener("input", (event) => { if (!composingSearch && !event.isComposing) queueSearch(); });
search.addEventListener("compositionstart", () => {
  composingSearch = true;
  clearSearchResults();
});
search.addEventListener("compositionend", () => {
  composingSearch = false;
  queueSearch();
});
placeSearch.addEventListener("click", findPlaces);
function dismissSearch() {
  search.value = "";
  clearSearchResults();
  search.focus();
}
$(".replay-search").addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing || composingSearch || selectedPlace?.composing) return;
  const inDetails = placeDetails.contains(event.target);
  if (event.key === "Escape") {
    event.preventDefault();
    if (inDetails) $("#place-details .icon-button").click();
    else dismissSearch();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const input = inDetails ? selectedPlace.input : search;
  if (event.target !== input && !event.target.matches(".replay-match")) return;
  const selector = inDetails ? "#place-details .replay-match" : "#location-results .replay-match, #place-results .replay-match";
  const matches = [...document.querySelectorAll(selector)].filter((match) => !match.disabled);
  if (!matches.length) return;
  const current = matches.indexOf(event.target);
  const next = event.key === "ArrowDown" ? matches[current + 1] : matches[current === -1 ? matches.length - 1 : current - 1];
  event.preventDefault();
  (next ?? input).focus();
});

$(".map-tools").addEventListener("click", (event) => {
  const action = event.target.closest("button")?.dataset.mapAction;
  if (action === "fit") {
    if (nodes.length) map?.fit(mapPadding());
    else map?.fitCountry();
  }
  if (action === "zoom-in") map?.zoomIn();
  if (action === "zoom-out") map?.zoomOut();
});

const mapParams = new URLSearchParams(location.search);
function focusTrain(key) {
  selectedTrain = key;
  setCollapsed(false);
  document.getElementById(`train-${key}`)?.focus();
  renderMap();
}

initMapController({
  container: $("#map-canvas"), sourceEl: $("#map-source"), noticeEl: $("#map-status"),
  config, forceMode: mapParams.get("map"), simulateFailure: { failNext: mapParams.get("mapfail") === "1" },
  callbacks: {
    onCityClick(cityId, keyboard) {
      addMapLocation(cities.get(cityId), null, keyboard);
    },
    onStationClick: chooseMapStation,
    onHotspotClick: pickHotspot,
    onMarkerClick: focusNode,
    onLineClick: focusTrain,
  },
}).then((controller) => {
  map = controller;
  renderMap();
  if (selectedPlace) map.locatePlace(mapPadding());
});
loadContext();

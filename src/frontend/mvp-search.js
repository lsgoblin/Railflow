/* 站点选择器：调用 /api/mvp/stations，候选同时显示站名与 stop_id。
 * 同名/同城多站靠 stop_id 区分；选择、查询与几何都使用同一个 stop_id。
 * 输入法组合期不发请求；迟到响应由 store 的 requestId 校验丢弃。
 */

import { el, icon } from "./ui.js";

const DEBOUNCE_MS = 250;

export function createStationPicker({
  root, side, label, placeholder, api, dispatch, getState, onSelect,
}) {
  let composing = false;
  let debounceTimer = 0;
  let resultsOpen = false;
  let lastSyncedStopId = null;
  let activeIndex = 0;
  let rafId = 0;
  let input = null;
  let clearButton = null;
  let resultsPanel = null;

  root.innerHTML = "";

  input = el("input", {
    class: "station-input",
    attrs: {
      id: `station-input-${side}`,
      type: "search",
      role: "combobox",
      "aria-expanded": "false",
      "aria-controls": `station-results-${side}`,
      "aria-autocomplete": "list",
      "aria-label": label,
      autocomplete: "off",
      spellcheck: "false",
      placeholder,
      enterkeyhint: "search",
    },
    dataset: { testid: `station-input-${side}` },
  });

  clearButton = el("button", {
    class: "icon-button station-clear",
    attrs: { type: "button", "aria-label": `清除${label}` },
    on: {
      click: () => {
        input.value = "";
        lastSyncedStopId = null;
        dispatch({ type: "MVP_STATION_CLEAR", side });
        input.focus({ preventScroll: true });
        resultsOpen = false;
        render();
      },
    },
  });
  clearButton.append(icon("close"));
  clearButton.hidden = true;

  resultsPanel = el("div", {
    class: "station-results",
    attrs: { id: `station-results-${side}`, role: "listbox", "aria-label": `${label}候选` },
  });
  resultsPanel.hidden = true;

  const wrap = el("div", { class: "station-picker" }, input, clearButton, resultsPanel);
  root.append(wrap);

  input.addEventListener("compositionstart", () => {
    composing = true;
    window.clearTimeout(debounceTimer);
  });

  input.addEventListener("compositionend", () => {
    composing = false;
    dispatchQuery(input.value);
    scheduleQuery(input.value);
  });

  input.addEventListener("input", () => {
    if (composing) {
      renderClear();
      return;
    }
    resultsOpen = Boolean(input.value.trim());
    dispatchQuery(input.value);
    render();
    scheduleQuery(input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.isComposing || composing) return;
    const station = getState().mvp.stations[side];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!station.items.length) return;
      event.preventDefault();
      if (!resultsOpen) {
        resultsOpen = true;
        render();
        return;
      }
      const current = activeIndex;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = (current + delta + station.items.length) % station.items.length;
      setActive(next);
      return;
    }
    if (event.key === "Enter") {
      if (station.status === "ready" && station.items.length) {
        event.preventDefault();
        const index = Math.max(0, activeIndex);
        selectStation(station.items[index]);
      }
      return;
    }
    if (event.key === "Escape") {
      if (resultsOpen) {
        event.preventDefault();
        resultsOpen = false;
        render();
      }
    }
  });

  input.addEventListener("focus", () => {
    if (input.value.trim() && getState().mvp.stations[side].items.length) {
      resultsOpen = true;
      render();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (root.contains(event.target)) return;
    if (resultsOpen) {
      resultsOpen = false;
      render();
    }
  });

  function dispatchQuery(value) {
    const requestId = getState().mvp.stations[side].requestId + 1;
    dispatch({ type: "MVP_STATION_QUERY", side, query: value, requestId });
    return requestId;
  }

  function scheduleQuery(value) {
    window.clearTimeout(debounceTimer);
    if (!value.trim()) {
      resultsOpen = false;
      return;
    }
    debounceTimer = window.setTimeout(() => runQuery(value), DEBOUNCE_MS);
  }

  async function runQuery(value) {
    if (!value.trim()) return;
    const state = getState();
    const requestId = state.mvp.stations[side].requestId + 1;
    dispatch({ type: "MVP_STATION_LOADING", side, requestId });
    resultsOpen = true;
    render();
    const response = await api.searchStations({
      datasetVersion: state.mvp.context.data?.dataset?.version,
      q: value,
      offset: 0,
      limit: 20,
    });
    if (!response.ok) {
      dispatch({ type: "MVP_STATION_ERROR", side, requestId, error: response.error });
      render();
      return;
    }
    const current = getState();
    if (current.mvp.stations[side].requestId !== requestId) return;
    if (current.mvp.stations[side].query !== value) return;
    dispatch({
      type: "MVP_STATION_RESULTS",
      side,
      requestId,
      query: value,
      items: response.data?.items ?? [],
    });
    render();
  }

  function selectStation(station) {
    if (!station) return;
    input.value = stationLabel(station);
    lastSyncedStopId = station.stopId;
    resultsOpen = false;
    dispatch({ type: "MVP_STATION_SELECT", side, station });
    onSelect?.(station);
    render();
  }

  function setActive(index) {
    if (!getState().mvp.stations[side].items.length) return;
    activeIndex = index;
    updateActive(index);
  }

  function updateActive(index) {
    const options = [...resultsPanel.querySelectorAll("[data-option-index]")];
    options.forEach((option, i) => {
      const active = i === index;
      option.dataset.active = active ? "true" : "false";
      option.setAttribute("aria-selected", active ? "true" : "false");
    });
    const activeOption = options[index];
    if (activeOption) {
      input.setAttribute("aria-activedescendant", activeOption.id);
      activeOption.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function renderClear() {
    clearButton.hidden = !input.value;
  }

  function renderResults() {
    const state = getState();
    const station = state.mvp.stations[side];
    resultsPanel.innerHTML = "";
    const shouldOpen = resultsOpen && Boolean(station.query.trim());
    resultsPanel.hidden = !shouldOpen;
    input.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    renderClear();
    if (!shouldOpen) return;

    if (station.status === "loading") {
      resultsPanel.append(el("p", { class: "station-status", text: "正在查找车站" }));
      return;
    }
    if (station.status === "error") {
      const wrapError = el("div", { class: "station-status", dataset: { tone: "error" } },
        el("p", { text: station.error?.message ?? "车站查找失败" }));
      const retry = el("button", {
        class: "button button-ghost",
        attrs: { type: "button" },
        text: "重试",
        on: { click: () => runQuery(input.value) },
      });
      retry.style.minHeight = "36px";
      wrapError.append(retry);
      resultsPanel.append(wrapError);
      return;
    }
    if (station.status === "empty") {
      resultsPanel.append(el("p", { class: "station-status", text: "未找到车站，试试站名或 stop_id" }));
      return;
    }
    if (station.status === "idle" || station.status === "typing") return;

    station.items.forEach((item, index) => {
      const active = index === activeIndex;
      const option = el(
        "button",
        {
          class: "station-option",
          attrs: {
            type: "button",
            role: "option",
            id: `station-option-${side}-${index}`,
            "aria-selected": active ? "true" : "false",
          },
          dataset: { optionIndex: String(index), active: active ? "true" : "false" },
          on: {
            click: () => selectStation(item),
            pointerenter: () => setActive(index),
          },
        },
        el("span", { class: "station-option-main" },
          el("span", { class: "station-option-name", text: item.stopName }),
          el("span", { class: "station-option-meta", text: `stop_id ${item.stopId} · ${item.coordinateSystem ?? "WGS84"}` })),
        el("span", { class: "tag tag-neutral", text: item.stopId })
      );
      resultsPanel.append(option);
    });
    updateActive(activeIndex);
  }

  function render() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      syncFromState();
      renderResults();
    });
  }

  function syncFromState() {
    const station = getState().mvp[side];
    if (station && station.stopId !== lastSyncedStopId) {
      lastSyncedStopId = station.stopId;
      input.value = stationLabel(station);
      return;
    }
    if (!station && lastSyncedStopId !== null) {
      lastSyncedStopId = null;
      input.value = "";
    }
  }

  return {
    render,
    focus() {
      input.focus({ preventScroll: true });
    },
    input,
  };
}

function stationLabel(station) {
  return `${station.stopName} · ${station.stopId}`;
}


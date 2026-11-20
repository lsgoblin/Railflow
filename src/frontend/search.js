/* 搜索：本地城市/车站检索，输入法组合期不发请求，结果消歧后可加入路线。
 * 组件只读 store 的搜索片段，选择结果时回调 app 的加入路线动作。
 */

import { el, icon } from "./ui.js";

const DEBOUNCE_MS = 250;

export function createSearch({ root, api, dispatch, getState, onSelectPlace, onError }) {
  let composing = false;
  let debounceTimer = 0;
  let resultsOpen = false;
  let input = null;
  let clearButton = null;
  let resultsPanel = null;
  let rafId = 0;

  root.innerHTML = "";

  const brand = el("span", { class: "search-brand", html: brandMarkup() });
  input = el("input", {
    class: "search-input",
    attrs: {
      id: "search-input",
      type: "search",
      role: "combobox",
      "aria-expanded": "false",
      "aria-controls": "search-results",
      "aria-autocomplete": "list",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "搜索城市、车站或地点",
      "aria-label": "搜索城市、车站或地点",
      enterkeyhint: "search",
    },
    dataset: { testid: "search-input", focusKey: "search-input" },
  });
  clearButton = el("button", {
    class: "icon-button search-clear",
    attrs: { type: "button", "aria-label": "清除搜索" },
    dataset: { focusKey: "search-clear" },
    on: {
      click: () => {
        input.value = "";
        dispatch({ type: "SEARCH_CLEAR" });
        input.focus({ preventScroll: true });
        resultsOpen = false;
        render();
      },
    },
  });
  clearButton.append(icon("close"));
  clearButton.hidden = true;

  resultsPanel = el("div", {
    class: "search-results",
    attrs: { id: "search-results", role: "listbox", "aria-label": "地点搜索结果" },
  });
  resultsPanel.hidden = true;

  root.append(brand, input, clearButton, resultsPanel);

  input.addEventListener("compositionstart", () => {
    composing = true;
    window.clearTimeout(debounceTimer);
    dispatch({ type: "SEARCH_SET_COMPOSING", composing: true });
  });

  input.addEventListener("compositionend", () => {
    composing = false;
    dispatch({ type: "SEARCH_SET_COMPOSING", composing: false });
    dispatch({ type: "SEARCH_SET_QUERY", query: input.value });
    scheduleQuery(input.value);
  });

  input.addEventListener("input", () => {
    if (composing) {
      renderClear();
      return;
    }
    const value = input.value;
    dispatch({ type: "SEARCH_SET_QUERY", query: value });
    resultsOpen = Boolean(value.trim());
    render();
    scheduleQuery(value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.isComposing || composing) return;
    const state = getState();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = state.ui.search.items;
      if (!items.length) return;
      event.preventDefault();
      if (!resultsOpen) {
        resultsOpen = true;
        render();
        return;
      }
      const current = state.ui.search.activeIndex;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (current + delta + items.length) % items.length;
      dispatch({ type: "SEARCH_SET_ACTIVE", index: nextIndex });
      updateActive();
      return;
    }
    if (event.key === "Enter") {
      const stateNow = getState();
      const items = stateNow.ui.search.items;
      if (stateNow.ui.search.status === "ready" && items.length) {
        event.preventDefault();
        const index = Math.max(0, stateNow.ui.search.activeIndex);
        selectPlace(items[index]);
      }
      return;
    }
    if (event.key === "Escape") {
      if (resultsOpen) {
        event.preventDefault();
        resultsOpen = false;
        render();
      } else if (input.value) {
        event.preventDefault();
        input.value = "";
        dispatch({ type: "SEARCH_CLEAR" });
        render();
      }
    }
  });

  input.addEventListener("focus", () => {
    const state = getState();
    if (state.ui.search.query.trim()) {
      resultsOpen = true;
      render();
    }
  });

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
    const requestId = getState().requests.search + 1;
    dispatch({ type: "SEARCH_LOADING", requestId });
    resultsOpen = true;
    render();
    const response = await api.searchPlaces(value);
    if (!response.ok) {
      if (getState().requests.search === requestId) {
        dispatch({ type: "SEARCH_ERROR", requestId, error: response.error });
        if (response.offline) onError?.(response.error);
      }
      render();
      return;
    }
    if (getState().requests.search !== requestId || getState().ui.search.query !== value) return;
    dispatch({ type: "SEARCH_READY", requestId, query: value, items: response.items });
    render();
  }

  function selectPlace(place) {
    if (!place) return;
    onSelectPlace(place);
    input.value = "";
    resultsOpen = false;
    dispatch({ type: "SEARCH_CLEAR" });
    render();
    input.focus({ preventScroll: true });
  }

  function renderClear() {
    clearButton.hidden = !input.value;
  }

  function updateActive() {
    const state = getState();
    const options = [...resultsPanel.querySelectorAll("[data-option-index]")];
    options.forEach((option, index) => {
      const active = index === state.ui.search.activeIndex;
      option.dataset.active = active ? "true" : "false";
      option.setAttribute("aria-selected", active ? "true" : "false");
    });
    const activeOption = options[state.ui.search.activeIndex];
    if (activeOption) {
      input.setAttribute("aria-activedescendant", activeOption.id);
      activeOption.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function renderResults() {
    const state = getState();
    const search = state.ui.search;
    resultsPanel.innerHTML = "";
    const shouldOpen = resultsOpen && Boolean(search.query.trim());
    resultsPanel.hidden = !shouldOpen;
    input.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    renderClear();
    if (!shouldOpen) return;

    if (search.status === "loading") {
      resultsPanel.append(el("p", { class: "search-status", text: "正在查找地点" }));
      return;
    }
    if (search.status === "error") {
      const wrap = el("div", { class: "search-status", dataset: { tone: "error" } }, el("p", { text: search.error?.message ?? "地点查找失败" }));
      const retry = el("button", {
        class: "button button-ghost",
        attrs: { type: "button" },
        text: "重试",
        on: { click: () => runQuery(input.value) },
      });
      retry.style.minHeight = "36px";
      wrap.append(retry);
      resultsPanel.append(wrap);
      return;
    }
    if (search.status === "empty") {
      resultsPanel.append(el("p", { class: "search-status", text: "未找到地点（示例数据仅含部分城市）" }));
      return;
    }
    if (search.status === "idle" || search.status === "typing") {
      return;
    }

    const groups = [
      { key: "city", label: "城市" },
      { key: "station", label: "车站" },
    ];
    let optionIndex = 0;
    for (const group of groups) {
      const items = search.items.filter((item) => item.type === group.key);
      if (!items.length) continue;
      resultsPanel.append(el("p", { class: "search-group-title", text: group.label, attrs: { role: "presentation" } }));
      for (const item of items) {
        const index = optionIndex;
        const active = index === search.activeIndex;
        const option = el(
          "button",
          {
            class: "search-option",
            attrs: {
              type: "button",
              role: "option",
              id: `search-option-${index}`,
              "aria-selected": active ? "true" : "false",
            },
            dataset: { optionIndex: String(index), active: active ? "true" : "false" },
            on: {
              click: () => selectPlace(item),
              pointerenter: () => {
                dispatch({ type: "SEARCH_SET_ACTIVE", index });
                updateActive();
              },
            },
          },
          el(
            "span",
            { class: "search-option-main" },
            el("span", { class: "search-option-name", text: item.name }),
            el("span", {
              class: "search-option-meta",
              text:
                item.type === "city"
                  ? `${item.province ?? ""} · 城市`
                  : `${item.cityName ?? ""} · 车站 · ${item.province ?? ""}`,
            })
          ),
          el("span", { class: `tag tag-${item.type === "city" ? "neutral" : "primary"}`, text: item.type === "city" ? "城市" : "车站" }),
          el(
            "span",
            { class: "search-option-action", attrs: { "aria-hidden": "true" } },
            icon("plus"),
            el("span", { text: "加入" })
          )
        );
        resultsPanel.append(option);
        optionIndex += 1;
      }
    }
    if (!optionIndex) {
      resultsPanel.append(el("p", { class: "search-status", text: "未找到地点" }));
    } else {
      updateActive();
    }
  }

  function render() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      renderResults();
    });
  }

  // 点击搜索框外部收起结果，不改变已加入路线。
  document.addEventListener("pointerdown", (event) => {
    if (root.contains(event.target)) return;
    if (resultsOpen) {
      resultsOpen = false;
      render();
    }
  });

  return {
    render,
    focus() {
      input.focus({ preventScroll: true });
    },
    getInput() {
      return input;
    },
  };
}

function brandMarkup() {
  return `<svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    <rect width="28" height="28" rx="8" fill="currentColor"></rect>
    <path d="M6 20c4.6-1 5.8-4.6 7-8 1.2-3.4 3.6-4.6 9-3.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"></path>
  </svg>`;
}

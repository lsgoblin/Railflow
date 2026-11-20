/* 工作面板：路线 / AI 助手 / 我的行程 共用同一面板。
 * 只渲染 store 中的数据；换乘次数、耗时、排序、票价合计都直接使用数据字段，不自行推导。
 */

import {
  clear,
  createButton,
  createTag,
  el,
  emptyState,
  formatDateTime,
  formatDayOffset,
  formatDuration,
  formatFare,
  formatTimestamp,
  inlineError,
  inlineNote,
  openModal,
  showToast,
  skeletonBlock,
  skeletonLines,
} from "./ui.js";
import { validatePlan } from "./store.js";

const PANEL_WIDTH_QUERY = "(max-width: 767px)";

export function createPanel({ headEl, bodyEl, footEl, dispatch, getState, actions }) {
  let aiDraft = "";

  function captureFocus() {
    const active = document.activeElement;
    const inside = active && (headEl.contains(active) || bodyEl.contains(active) || footEl.contains(active));
    const record = {
      key: inside ? active.dataset.focusKey ?? active.id ?? null : null,
      start: null,
      end: null,
      scrollTop: bodyEl.scrollTop,
    };
    if (inside && typeof active.selectionStart === "number") {
      record.start = active.selectionStart;
      record.end = active.selectionEnd;
    }
    return record;
  }

  function restoreFocus(record) {
    if (!record.key) return;
    const target = document.querySelector(`[data-focus-key="${CSS.escape(record.key)}"], #${CSS.escape(record.key)}`);
    if (target && target !== document.activeElement) {
      target.focus({ preventScroll: true });
      if (record.start !== null && typeof target.setSelectionRange === "function") {
        try {
          target.setSelectionRange(record.start, record.end);
        } catch {
          /* 非文本输入不支持选区，忽略 */
        }
      }
    }
  }

  function render(state) {
    const focus = captureFocus();
    renderHead(state);
    renderBody(state);
    renderFoot(state);
    restoreFocus(focus);
    bodyEl.scrollTop = focus.scrollTop;
  }

  /* ---------- 面板头 ---------- */

  function renderHead(state) {
    clear(headEl);
    const isMobile = window.matchMedia(PANEL_WIDTH_QUERY).matches;
    headEl.append(el("div", { class: "grip", attrs: { "aria-hidden": "true" } }));

    if (state.ui.view === "trips") {
      const heading = el("div", { class: "panel-heading" });
      heading.append(
        createButton({
          variant: "secondary",
          iconOnly: true,
          iconName: "back",
          ariaLabel: "返回路线",
          onClick: () => actions.setView("route"),
          attrs: { "data-focus-key": "trips-back" },
        }),
        el("h1", { class: "panel-heading-title", text: "我的行程" })
      );
      heading.append(
        el(
          "div",
          { class: "panel-head-actions" },
          createButton({
            variant: "secondary",
            label: "新建行程",
            onClick: () => actions.newTrip(),
            attrs: { "data-focus-key": "trips-new" },
          })
        )
      );
      headEl.append(heading, el("p", { class: "panel-head-sub", text: "保存在本机浏览器" }));
      if (isMobile) headEl.append(renderDrawerControls(state));
      return;
    }

    const tabs = el("div", { class: "panel-tabs", attrs: { role: "tablist", "aria-label": "工作区页签" } });
    for (const [key, label] of [
      ["route", "路线"],
      ["ai", "AI 助手"],
    ]) {
      const tab = el("button", {
        class: "panel-tab",
        attrs: {
          type: "button",
          role: "tab",
          id: `tab-${key}`,
          "aria-selected": state.ui.view === key ? "true" : "false",
          "aria-controls": "panel-body",
          tabindex: state.ui.view === key ? "0" : "-1",
        },
        text: label,
        dataset: { focusKey: `tab-${key}` },
        on: {
          click: () => actions.setView(key),
          keydown: (event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = key === "route" ? "ai" : "route";
            actions.setView(next);
            document.getElementById(`tab-${next}`)?.focus({ preventScroll: true });
          },
        },
      });
      tabs.append(tab);
    }

    const headActions = el("div", { class: "panel-head-actions" });
    if (!isMobile && state.ui.view === "ai") {
      headActions.append(
        createButton({
          variant: "secondary",
          iconOnly: true,
          iconName: "chevronLeft",
          ariaLabel: "收起 AI 助手",
          onClick: () => actions.setCollapsed(true),
          attrs: { "data-focus-key": "collapse-ai" },
        })
      );
    }
    headEl.append(tabs, headActions);

    if (isMobile) {
      headEl.append(renderDrawerControls(state));
      if (state.ui.drawer === "collapsed") {
        headEl.append(el("p", { class: "drawer-summary", text: summaryLine(state) }));
      }
    }
  }

  function renderDrawerControls(state) {
    const wrap = el("div", { class: "drawer-controls", attrs: { role: "group", "aria-label": "抽屉高度" } });
    const buttons = [
      ["collapsed", "chevronDown", "收起抽屉"],
      ["half", "minus", "半屏"],
      ["expanded", "chevronUp", "展开抽屉"],
    ];
    for (const [drawer, iconName, label] of buttons) {
      wrap.append(
        createButton({
          variant: "secondary",
          iconOnly: true,
          iconName,
          ariaLabel: label,
          onClick: () => actions.setDrawer(drawer),
          attrs: { "aria-pressed": state.ui.drawer === drawer ? "true" : "false", "data-focus-key": `drawer-${drawer}` },
        })
      );
    }
    return wrap;
  }

  function summaryLine(state) {
    const nodes = state.plan.nodes;
    if (!nodes.length) return "尚未添加城市";
    return nodes.map((node) => node.cityName).join(" → ");
  }

  /* ---------- 面板主体 ---------- */

  function renderBody(state) {
    clear(bodyEl);
    if (state.ui.view === "trips") {
      renderTrips(state);
      return;
    }
    if (state.ui.view === "ai") {
      renderAi(state);
      return;
    }
    renderRoute(state);
  }

  function renderRoute(state) {
    bodyEl.append(sectionSummary(state), sectionConditions(state), sectionNodes(state), sectionResults(state));
  }

  function section(titleText, id, options = {}) {
    const head = el("div", { class: "section-head" });
    head.append(el("h2", { class: "section-title", attrs: { id }, text: titleText }));
    if (options.meta) head.append(el("span", { class: "section-meta", text: options.meta }));
    if (options.action) head.append(options.action);
    return el("section", { class: "panel-section", attrs: { "aria-labelledby": id } }, head);
  }

  function sectionSummary(state) {
    const sectionEl = section("行程摘要", "summary-title");
    const nodes = state.plan.nodes;
    const planTitle = nodes.length ? `${nodes[0].cityName} → ${nodes[nodes.length - 1].cityName}` : "未命名行程";
    const titleRow = el("div", { class: "plan-title-row" }, el("h3", { class: "plan-title", text: planTitle }));
    sectionEl.append(titleRow);

    if (nodes.length) {
      const chain = el("p", { class: "plan-cities" });
      nodes.forEach((node, index) => {
        if (index > 0) chain.append(el("span", { class: "plan-cities-sep", text: "→" }));
        chain.append(el("span", { text: node.cityName }));
      });
      sectionEl.append(chain);
    } else {
      sectionEl.append(el("p", { class: "state-note", text: "搜索城市并加入路线" }));
    }

    const meta = el("div", { class: "plan-meta-row" });
    if (state.plan.startDate) meta.append(createTag(`出发 ${state.plan.startDate}`, "neutral"));
    if (state.dataset.data) meta.append(createTag("历史回放", "neutral", { title: state.dataset.data.version }));
    if (nodes.length) meta.append(saveStatusTag(state));
    sectionEl.append(meta);
    return sectionEl;
  }

  function saveStatusTag(state) {
    const save = state.ui.save;
    if (save.status === "saving") return createTag("保存中", "neutral");
    if (save.status === "error") return createTag("保存失败", "danger", { title: save.error?.message ?? "" });
    if (save.status === "saved" && save.savedRevision === state.plan.revision) {
      return createTag(save.savedAt ? `已保存 ${save.savedAt}` : "已保存", "positive");
    }
    if (save.status === "saved" || save.status === "dirty") return createTag("未保存修改", "warning");
    return createTag("未保存", "neutral");
  }

  function sectionConditions(state) {
    const sectionEl = section("日期与条件", "conditions-title");
    const dataset = state.dataset.data;
    const validation = validatePlan(state.plan, dataset);

    if (state.dataset.status === "loading") {
      sectionEl.append(skeletonLines(2, ["medium", ""]));
      return sectionEl;
    }
    if (state.dataset.status === "error") {
      sectionEl.append(
        inlineError(state.dataset.error?.message ?? "数据版本载入失败", createButton({ variant: "secondary", label: "重试", onClick: () => actions.loadDataset() }))
      );
      return sectionEl;
    }

    const grid = el("div", { class: "conditions-row" });
    const dateField = el("div", { class: "field" });
    const dateId = "plan-start-date";
    dateField.append(el("label", { class: "field-label", attrs: { for: dateId }, text: "首次出发日期" }));
    const dateInput = el("input", {
      class: "input",
      attrs: {
        id: dateId,
        type: "date",
        value: state.plan.startDate ?? "",
        min: dataset?.dateRange?.min ?? null,
        max: dataset?.dateRange?.max ?? null,
        "aria-invalid": validation.errors.startDate ? "true" : "false",
        "aria-describedby": validation.errors.startDate ? "plan-date-error" : null,
      },
      dataset: { focusKey: "plan-start-date" },
      on: {
        change: (event) => actions.setDate(event.target.value),
      },
    });
    dateField.append(dateInput);
    if (validation.errors.startDate) {
      dateField.append(el("p", { class: "field-error", attrs: { id: "plan-date-error" }, text: validation.errors.startDate }));
    }
    grid.append(dateField);

    const versionField = el("div", { class: "field" });
    versionField.append(
      el("span", { class: "field-label", text: "数据版本" }),
      el("p", { class: "state-note", text: dataset?.version ?? "未知" })
    );
    grid.append(versionField);
    sectionEl.append(grid);

    if (validation.errors.station) {
      sectionEl.append(el("p", { class: "field-error", text: validation.errors.station }));
    }

    const foot = el("p", { class: "conditions-foot", text: "停留按到达后的下一自然日继续出发" });
    sectionEl.append(foot);
    return sectionEl;
  }

  function sectionNodes(state) {
    const nodes = state.plan.nodes;
    const meta = nodes.length ? `共 ${nodes.length} 站` : "";
    const sectionEl = section("城市节点", "nodes-title", { meta });
    if (!nodes.length) {
      sectionEl.append(emptyState("未添加城市", [createButton({ variant: "ghost", label: "去搜索", onClick: () => actions.focusSearch() })]));
      return sectionEl;
    }
    const list = el("ul", { class: "node-list" });
    nodes.forEach((node, index) => {
      list.append(renderNodeRow(state, node, index, nodes.length));
    });
    sectionEl.append(list);
    if (nodes.length < 2) {
      sectionEl.append(el("p", { class: "field-hint", text: "至少添加两个城市才能查询" }));
    }
    return sectionEl;
  }

  function nodeRole(index, total) {
    if (index === 0) return "start";
    if (index === total - 1) return "end";
    return "middle";
  }

  function nodeRoleLabel(index, total) {
    if (index === 0) return "起";
    if (index === total - 1) return "终";
    return String(index + 1);
  }

  function renderNodeRow(state, node, index, total) {
    const role = nodeRole(index, total);
    const selected = state.plan.selectedNodeId === node.nodeId;
    const li = el("li", {
      class: "node-row",
      dataset: { role, selected: selected ? "true" : "false" },
    });
    const stationText = describeStations(node, role);
    const main = el(
      "button",
      {
        class: "node-main",
        attrs: { type: "button", "aria-expanded": selected ? "true" : "false" },
        dataset: { focusKey: `node-${node.nodeId}` },
        on: { click: () => actions.selectNode(selected ? null : node.nodeId) },
      },
      el("span", { class: "node-index", text: nodeRoleLabel(index, total), attrs: { "aria-hidden": "true" } }),
      el("span", { class: "node-text" }, el("span", { class: "node-city", text: node.cityName }), el("span", { class: "node-station", text: stationText })),
      el("span", { class: "node-meta", text: describeNodeMeta(node, role) })
    );
    li.append(main);
    if (selected) li.append(renderNodeEditor(state, node, index, total, role));
    return li;
  }

  function describeStations(node, role) {
    if (role === "start") return node.departureStationName ? `${node.departureStationName} 出发` : "待匹配车站";
    if (role === "end") return node.arrivalStationName ? `${node.arrivalStationName} 到达` : "待匹配车站";
    const arrival = node.arrivalStationName ?? "待匹配";
    const departure = node.departureStationName ?? "待匹配";
    return arrival === departure ? `${arrival}` : `到 ${arrival} · 发 ${departure}`;
  }

  function describeNodeMeta(node, role) {
    if (role === "middle") return node.stayDays ? `停留 ${node.stayDays} 天` : "";
    if (role === "start") return "起点";
    return "终点";
  }

  function renderNodeEditor(state, node, index, total, role) {
    const editor = el("div", { class: "node-editor" });
    const stations = actions.stationsOfCity(node.cityId);
    const validation = validatePlan(state.plan, state.dataset.data);

    const makeStationSelect = (label, value, fieldName) => {
      const field = el("div", { class: "field" });
      const selectId = `${fieldName}-${node.nodeId}`;
      field.append(el("label", { class: "field-label", attrs: { for: selectId }, text: label }));
      const select = el("select", {
        class: "select",
        attrs: { id: selectId },
        dataset: { focusKey: `${fieldName}-${node.nodeId}` },
        on: {
          change: (event) => {
            const station = stations.find((item) => item.id === event.target.value);
            if (!station) return;
            const patch = {};
            if (fieldName === "arrival") {
              patch.arrivalStationId = station.id;
              patch.arrivalStationName = station.name;
            } else {
              patch.departureStationId = station.id;
              patch.departureStationName = station.name;
            }
            if (role === "start") {
              patch.stationId = station.id;
              patch.stationName = station.name;
            }
            if (role === "end") {
              patch.stationId = station.id;
              patch.stationName = station.name;
            }
            patch.matchSource = "manual";
            actions.updateNode(node.nodeId, patch);
          },
        },
      });
      const current = fieldName === "arrival" ? node.arrivalStationId : node.departureStationId;
      for (const station of stations) {
        const option = el("option", { attrs: { value: station.id }, text: station.name });
        if (station.id === current) option.selected = true;
        select.append(option);
      }
      if (!stations.length) {
        const option = el("option", { attrs: { value: "" }, text: "待匹配" });
        option.selected = true;
        select.append(option);
      }
      field.append(select);
      return field;
    };

    const row = el("div", { class: "node-editor-row" });
    if (role === "start") {
      row.append(makeStationSelect("出发站", node.departureStationId, "departure"));
    } else if (role === "end") {
      row.append(makeStationSelect("到达站", node.arrivalStationId, "arrival"));
    } else {
      row.append(makeStationSelect("到达站", node.arrivalStationId, "arrival"), makeStationSelect("出发站", node.departureStationId, "departure"));
    }
    editor.append(row);

    if (role === "middle") {
      const stayField = el("div", { class: "field" });
      const stayId = `stay-${node.nodeId}`;
      stayField.append(el("label", { class: "field-label", attrs: { for: stayId }, text: "停留天数" }));
      const stayRow = el("div", { class: "stay-row" });
      const input = el("input", {
        class: "input",
        attrs: {
          id: stayId,
          type: "number",
          min: "1",
          step: "1",
          inputmode: "numeric",
          value: node.stayDays ?? "",
          "aria-invalid": validation.errors[node.nodeId] ? "true" : "false",
        },
        dataset: { focusKey: `stay-${node.nodeId}` },
        on: {
          change: (event) => actions.updateStay(node.nodeId, event.target.value),
        },
      });
      input.classList.add("stay-input");
      stayRow.append(
        createButton({
          variant: "secondary",
          iconOnly: true,
          iconName: "minus",
          ariaLabel: "减少停留天数",
          onClick: () => actions.changeStay(node.nodeId, -1),
        }),
        input,
        createButton({
          variant: "secondary",
          iconOnly: true,
          iconName: "plus",
          ariaLabel: "增加停留天数",
          onClick: () => actions.changeStay(node.nodeId, 1),
        })
      );
      stayField.append(stayRow);
      if (validation.errors[node.nodeId]) {
        stayField.append(el("p", { class: "field-error", text: validation.errors[node.nodeId] }));
      }
      editor.append(stayField);
    }

    const actionsRow = el("div", { class: "node-editor-actions" });
    actionsRow.append(
      createButton({
        variant: "secondary",
        iconName: "arrowUp",
        label: "上移",
        disabled: index === 0,
        onClick: () => actions.moveNode(node.nodeId, "up"),
        attrs: { "data-focus-key": `move-up-${node.nodeId}` },
      }),
      createButton({
        variant: "secondary",
        iconName: "arrowDown",
        label: "下移",
        disabled: index === total - 1,
        onClick: () => actions.moveNode(node.nodeId, "down"),
        attrs: { "data-focus-key": `move-down-${node.nodeId}` },
      }),
      createButton({
        variant: "danger",
        iconName: "trash",
        label: "移除",
        onClick: () => actions.removeNode(node.nodeId),
        attrs: { "data-focus-key": `remove-${node.nodeId}` },
      })
    );
    editor.append(actionsRow);
    const source = node.matchSource === "manual" ? "车站：已手动选择" : "车站：自动匹配";
    editor.append(el("p", { class: "field-hint", text: `${source} · 示例数据` }));
    return editor;
  }

  /* ---------- 方案 ---------- */

  function sectionResults(state) {
    const results = state.results;
    const meta = results.queryDate ? `查询日期 ${results.queryDate}` : "";
    const sectionEl = section("方案", "plans-title", { meta });

    if (results.status === "idle") {
      sectionEl.append(el("p", { class: "state-note", text: "查询后显示参考方案" }));
      return sectionEl;
    }

    if (results.status === "loading") {
      sectionEl.append(loadingResults(state));
      return sectionEl;
    }

    if (results.status === "error") {
      sectionEl.append(
        inlineError(
          results.error?.message ?? "历史数据暂不可用",
          createButton({ variant: "secondary", label: "重试", onClick: () => actions.query(), attrs: { "data-focus-key": "results-retry" } })
        )
      );
      return sectionEl;
    }

    if (results.status === "empty") {
      sectionEl.append(renderEmptyResults(results));
      return sectionEl;
    }

    if (results.status === "stale") {
      sectionEl.append(
        inlineNote("条件已修改，重新查询后方案才生效", "warning"),
        el("div", { class: "stale-note" }, "")
      );
    }

    const datasetVersion = state.dataset.data?.version;
    const header = el("div", { class: "results-head" });
    header.append(el("h3", { class: "results-title", text: "参考方案" }));
    if (datasetVersion) header.append(createTag("历史回放", "neutral", { title: datasetVersion }));
    sectionEl.append(header);

    const resultsMeta = el("div", { class: "results-meta" });
    resultsMeta.append(el("span", { text: `${state.plan.nodes[0]?.cityName ?? ""} → ${state.plan.nodes[state.plan.nodes.length - 1]?.cityName ?? ""}` }));
    if (results.datasetVersion) resultsMeta.append(el("span", { text: results.datasetVersion }));
    sectionEl.append(resultsMeta);

    if (results.compareActive) {
      sectionEl.append(renderCompareTable(state));
      return sectionEl;
    }

    const items = results.items;
    const visible = results.showAll ? items : items.slice(0, 3);
    const list = el("div", { class: "plan-list" });
    for (const candidate of visible) {
      list.append(renderPlanCard(state, candidate));
    }
    sectionEl.append(list);

    if (items.length > 3) {
      sectionEl.append(
        el(
          "div",
          { class: "more-plans" },
          createButton({
            variant: "secondary",
            block: true,
            label: results.showAll ? "收起方案" : `更多方案（${items.length - 3}）`,
            onClick: () => actions.setShowAll(!results.showAll),
            attrs: { "data-focus-key": "more-plans" },
          })
        )
      );
    }

    sectionEl.append(renderCompareBar(state));
    return sectionEl;
  }

  function loadingResults(state) {
    const wrap = el("div", {});
    const tagRow = el("div", { class: "results-head" });
    tagRow.append(el("h3", { class: "results-title", text: "正在查询车次" }), createTag("加载中", "neutral"));
    wrap.append(tagRow);
    if (state.results.items.length) {
      wrap.append(el("p", { class: "state-note", text: "已有结果保留，查询完成前不作当前有效结果" }));
    } else {
      const skeleton = el("div", { attrs: { "aria-hidden": "true" } });
      skeleton.append(skeletonBlock(72), skeletonBlock(72), skeletonBlock(72));
      wrap.append(skeleton);
    }
    return wrap;
  }

  function renderEmptyResults(results) {
    const wrap = el("div", {});
    const reason = results.emptyReason;
    const head = el("div", { class: "results-head" });
    head.append(el("h3", { class: "results-title", text: reason?.title ?? "无可行车次" }));
    wrap.append(head);
    if (reason?.legs?.length) {
      const list = el("ul", { class: "node-list" });
      for (const leg of reason.legs) {
        list.append(
          el(
            "li",
            { class: "node-row" },
            el(
              "div",
              { class: "node-main" },
              el("span", { class: "node-text" }, el("span", { class: "node-city", text: `${leg.from} → ${leg.to}` }), el("span", { class: "node-station", text: `${leg.date ?? ""} ${leg.message ?? ""}` }))
            )
          )
        );
      }
      wrap.append(list);
    }
    if (reason?.hint) wrap.append(el("p", { class: "field-hint", text: reason.hint }));
    wrap.append(
      el(
        "div",
        { class: "state-action" },
        createButton({ variant: "secondary", label: "重新查询", onClick: () => actions.query(), attrs: { "data-focus-key": "empty-retry" } })
      )
    );
    return wrap;
  }

  function renderPlanCard(state, candidate) {
    const results = state.results;
    const selected = results.selectedId === candidate.candidateId;
    const stale = results.status === "stale";
    const card = el("article", { class: "plan-card", dataset: { selected: selected ? "true" : "false" } });

    const head = el("div", { class: "plan-card-head" });
    const compare = el("input", {
      class: "plan-check",
      attrs: {
        type: "checkbox",
        "aria-label": `比较 ${candidate.label ?? "方案"}`,
        checked: results.compareIds.includes(candidate.candidateId) ? true : null,
      },
      dataset: { focusKey: `compare-${candidate.candidateId}` },
      on: {
        change: (event) => {
          event.stopPropagation();
          actions.toggleCompare(candidate.candidateId);
        },
      },
    });
    head.append(compare);

    const main = el(
      "button",
      {
        class: "plan-card-main",
        attrs: { type: "button", "aria-expanded": selected ? "true" : "false", "aria-label": `选择 ${candidate.label ?? "方案"}` },
        dataset: { focusKey: `candidate-${candidate.candidateId}` },
        on: { click: () => actions.selectCandidate(candidate.candidateId) },
      },
      el(
        "span",
        { class: "plan-card-title" },
        el("strong", { text: candidate.label ?? "方案" }),
        createTag(`换乘 ${candidate.transferCount} 次`, candidate.transferCount === 0 ? "positive" : "neutral"),
        stale ? createTag("待重新计算", "warning") : null,
        selected ? createTag("已选", "primary") : null
      ),
      el(
        "span",
        { class: "plan-times" },
        el("span", { class: "plan-time", text: candidate.firstDeparture?.time ?? "未知" }),
        el("span", { class: "plan-time-sub", text: candidate.firstDeparture?.date ?? "" }),
        el("span", { class: "plan-time-sub", text: "→" }),
        el("span", { class: "plan-time", text: candidate.lastArrival?.time ?? "未知" }),
        el("span", { class: "plan-time-sub", text: `${candidate.lastArrival?.date ?? ""} ${formatDayOffset(candidate.lastArrival?.dayOffset)}` })
      ),
      el(
        "span",
        { class: "plan-metrics" },
        el("span", { text: `总耗时 ${formatDuration(candidate.totalDurationMinutes)}` }),
        el("span", { text: `${candidate.legs?.length ?? 0} 段` })
      ),
      el("span", { class: "plan-fare", text: fareText(candidate) })
    );
    head.append(main);
    card.append(head);

    if (candidate.stationChange && candidate.stationChangeNote) {
      card.append(el("div", { class: "plan-legs" }, inlineNote(candidate.stationChangeNote, "warning")));
    }

    for (const tag of candidateStatusTags(candidate)) {
      main.querySelector(".plan-card-title").append(tag);
    }

    if (selected) {
      const legs = el("div", { class: "plan-legs" });
      for (const leg of candidate.legs ?? []) {
        legs.append(renderLeg(state, candidate, leg));
      }
      card.append(legs);
    }
    return card;
  }

  function candidateStatusTags(candidate) {
    const tags = [];
    const legs = candidate.legs ?? [];
    if (legs.some((leg) => leg.geometryStatus === "missing")) tags.push(createTag("轨迹缺失", "danger"));
    if (legs.some((leg) => leg.timeStatus === "unmatched")) tags.push(createTag("时刻未匹配", "danger"));
    if (legs.some((leg) => leg.fareStatus === "unknown")) tags.push(createTag("价格未知", "warning"));
    if (candidate.stationChange) tags.push(createTag("跨站衔接未核实", "warning"));
    return tags;
  }

  function fareText(candidate) {
    const fare = candidate.fare;
    if (!fare) return "历史票价未知";
    if (fare.unknownSegments > 0) {
      if (fare.knownTotal) {
        return `已知历史票价合计 ${formatFare(fare.knownTotal, fare.currency)}，另有 ${fare.unknownSegments} 段价格未知`;
      }
      return `历史票价未知（${fare.unknownSegments} 段）`;
    }
    if (!fare.knownTotal) return "历史票价未知";
    const version = fare.version ? `（${shortVersion(fare.version)}）` : "";
    return `历史票价合计 ${formatFare(fare.knownTotal, fare.currency)}${version}`;
  }

  function shortVersion(version) {
    const match = String(version).match(/(\d{4})\s*版/);
    return match ? `${match[1]} 版` : version;
  }

  function renderLeg(state, candidate, leg) {
    const row = el("div", { class: "leg-row" });
    const detailOpen = state.results.detailsLegId === leg.legId;
    const main = el("div", { class: "leg-main" });
    main.append(el("span", { class: "leg-train", text: leg.trainNumber ?? "车次未知" }));
    const route = el("div", { class: "leg-route" });
    route.append(
      el(
        "div",
        { class: "leg-stations" },
        el("span", { text: leg.fromStation ?? "未知" }),
        el("span", { attrs: { "aria-hidden": "true" }, text: "→" }),
        el("span", { text: leg.toStation ?? "未知" })
      ),
      el("div", { class: "leg-time", text: `${formatDateTime(leg.departureDate, leg.departureTime)} → ${formatDateTime(leg.arrivalDate, leg.arrivalTime)} ${formatDayOffset(leg.arrivalDayOffset)}` }),
      el(
        "div",
        { class: "leg-meta" },
        el("span", { text: leg.seatType ?? "席别未知" }),
        el("span", {
          text:
            leg.fareStatus === "known"
              ? `历史票价 ${formatFare(leg.price?.amount, leg.price?.currency)}（${shortVersion(leg.price?.version ?? "")}）`
              : "历史票价未知",
        })
      )
    );
    main.append(route);
    row.append(main);

    const statuses = el("div", { class: "leg-statuses" });
    if (leg.timeStatus && leg.timeStatus !== "verified") statuses.append(createTag("历史时刻未匹配", "danger"));
    if (leg.geometryStatus === "missing") statuses.append(createTag("铁路轨迹暂不可用", "warning"));
    if (leg.fareStatus === "unknown") statuses.append(createTag("价格未知", "warning"));
    if (statuses.childElementCount) row.append(statuses);

    if (leg.geometryStatus === "missing") {
      row.append(
        el(
          "p",
          { class: "geometry-note" },
          el("span", { text: `该区间铁路轨迹暂不可用${leg.geometryMissingReason ? `：${leg.geometryMissingReason}` : ""}；地图不连线。` })
        )
      );
    }

    const foot = el("div", { class: "leg-foot" });
    foot.append(
      createButton({
        variant: "ghost",
        label: detailOpen ? "收起区间" : "查看区间",
        onClick: () => actions.selectLegDetail(leg.legId),
        attrs: {
          "aria-expanded": detailOpen ? "true" : "false",
          "data-focus-key": `leg-${leg.legId}`,
        },
      })
    );
    row.append(foot);

    if (detailOpen) row.append(renderLegDetail(leg));
    return row;
  }

  function renderLegDetail(leg) {
    const detail = el("div", { class: "leg-detail" });
    const rows = [
      ["发到站", `${leg.fromCity ?? ""} ${leg.fromStation ?? ""} → ${leg.toCity ?? ""} ${leg.toStation ?? ""}`],
      ["出发", formatDateTime(leg.departureDate, leg.departureTime)],
      ["到达", `${formatDateTime(leg.arrivalDate, leg.arrivalTime)} ${formatDayOffset(leg.arrivalDayOffset)}`.trim()],
      ["席别", leg.seatType ?? "未知"],
      [
        "历史票价",
        leg.fareStatus === "known"
          ? `${formatFare(leg.price?.amount, leg.price?.currency)}（${leg.price?.version ?? "版本未知"}）`
          : "未知",
      ],
      [
        "铁路轨迹",
        leg.geometryStatus === "ready"
          ? `已取得（${leg.geometry?.source ?? "来源未知"}）`
          : "暂不可用，地图不连线",
      ],
      ["数据版本", leg.dataVersion ?? "未知"],
      ["时刻来源", leg.timeSource ?? "未知"],
    ];
    for (const [key, value] of rows) {
      detail.append(
        el("div", { class: "leg-detail-row" }, el("span", { class: "leg-detail-key", text: key }), el("span", { text: value }))
      );
    }
    return detail;
  }

  function renderCompareBar(state) {
    const results = state.results;
    const bar = el("div", { class: "compare-bar" });
    if (!results.compareIds.length) {
      bar.append(el("span", { class: "compare-bar-label", text: "勾选 2–3 个方案可比较" }));
      return bar;
    }
    bar.append(el("span", { class: "compare-bar-label", text: `已选 ${results.compareIds.length} 项` }));
    bar.append(
      createButton({
        variant: "primary",
        label: "比较",
        disabled: results.compareIds.length < 2,
        onClick: () => actions.setCompareActive(true),
        attrs: { "data-focus-key": "compare-open" },
      }),
      createButton({
        variant: "ghost",
        label: "清除",
        onClick: () => actions.clearCompare(),
        attrs: { "data-focus-key": "compare-clear" },
      })
    );
    return bar;
  }

  function renderCompareTable(state) {
    const results = state.results;
    const candidates = results.items.filter((item) => results.compareIds.includes(item.candidateId));
    const wrap = el("div", {});
    wrap.append(
      el(
        "div",
        { class: "results-head" },
        el("h3", { class: "results-title", text: "方案比较" }),
        createTag("勾选状态", "neutral")
      )
    );
    const tableWrap = el("div", { class: "compare-table-wrap" });
    const table = el("table", { class: "compare-table" });
    const thead = el("thead", {});
    const headRow = el("tr", {});
    headRow.append(el("th", { attrs: { scope: "col" }, text: "指标" }));
    for (const candidate of candidates) headRow.append(el("th", { attrs: { scope: "col" }, text: candidate.label ?? "方案" }));
    thead.append(headRow);
    table.append(thead);

    const rows = [
      ["换乘次数", (candidate) => `${candidate.transferCount} 次`],
      ["首次出发", (candidate) => formatDateTime(candidate.firstDeparture?.date, candidate.firstDeparture?.time)],
      ["最终到达", (candidate) => `${formatDateTime(candidate.lastArrival?.date, candidate.lastArrival?.time)} ${formatDayOffset(candidate.lastArrival?.dayOffset)}`.trim()],
      ["总耗时", (candidate) => formatDuration(candidate.totalDurationMinutes)],
      ["历史费用", (candidate) => fareText(candidate)],
      ["缺失项", (candidate) => candidateStatusTags(candidate).map((tag) => tag.textContent).join("、") || "无"],
    ];
    const tbody = el("tbody", {});
    for (const [label, value] of rows) {
      const row = el("tr", {});
      row.append(el("th", { attrs: { scope: "row" }, text: label }));
      for (const candidate of candidates) row.append(el("td", { text: value(candidate) }));
      tbody.append(row);
    }
    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);
    wrap.append(
      el(
        "div",
        { class: "state-action" },
        createButton({ variant: "secondary", label: "返回列表", onClick: () => actions.setCompareActive(false), attrs: { "data-focus-key": "compare-back" } })
      )
    );
    return wrap;
  }

  /* ---------- AI 助手 ---------- */

  function renderAi(state) {
    bodyEl.append(sectionSummary(state));
    const ai = state.ui.ai;
    const log = el("div", { class: "ai-log", attrs: { "aria-live": "polite" } });
    for (const message of ai.messages) {
      const bubble = el("div", { class: "ai-message", dataset: { role: message.role } });
      if (message.role === "assistant" && message.status === "failed") {
        bubble.append(
          inlineError(
            message.error?.message ?? "AI 服务未接入",
            createButton({
              variant: "secondary",
              label: "重试",
              onClick: () => actions.aiRetry(),
              attrs: { "data-focus-key": "ai-retry" },
            })
          )
        );
      } else {
        bubble.append(el("div", { class: "ai-bubble", text: message.text }));
      }
      log.append(bubble);
    }
    if (ai.pending) {
      const pending = el("div", { class: "ai-message", dataset: { role: "assistant" } });
      pending.append(el("div", { class: "ai-bubble", text: "正在生成" }));
      log.append(pending);
    }
    bodyEl.append(log);
  }

  /* ---------- 我的行程 ---------- */

  function renderTrips(state) {
    const trips = state.ui.trips;
    if (trips.status === "loading" || trips.status === "idle") {
      const wrap = el("div", { class: "panel-section" });
      wrap.append(skeletonLines(3, ["medium", "", "short"]));
      bodyEl.append(wrap);
      return;
    }
    if (trips.status === "error") {
      const wrap = el("div", { class: "panel-section" });
      wrap.append(inlineError(trips.error?.message ?? "读取本机行程失败", createButton({ variant: "secondary", label: "重试", onClick: () => actions.openTrips() })));
      bodyEl.append(wrap);
      return;
    }
    const wrap = el("div", { class: "panel-section" });
    if (!trips.items.length) {
      wrap.append(emptyState("暂无行程", [createButton({ variant: "primary", label: "新建行程", onClick: () => actions.newTrip() })]));
      bodyEl.append(wrap);
      return;
    }
    const list = el("ul", { class: "trip-list" });
    for (const draft of trips.items) {
      const item = el("li", { class: "trip-row" });
      const main = el(
        "button",
        {
          class: "trip-main",
          attrs: { type: "button" },
          dataset: { focusKey: `trip-${draft.draftId}` },
          on: { click: () => actions.openDraft(draft.draftId) },
        },
        el("span", { class: "trip-title", text: draft.title }),
        el("span", {
          class: "trip-meta",
          text: [
            (draft.plan?.nodes ?? []).map((node) => node.cityName).join(" → "),
            draft.plan?.startDate,
            draft.updatedAt ? formatTimestamp(draft.updatedAt) : "",
          ]
            .filter(Boolean)
            .join(" · "),
        })
      );
      const actionsWrap = el("div", { class: "trip-actions" });
      actionsWrap.append(
        createButton({
          variant: "danger",
          iconOnly: true,
          iconName: "trash",
          ariaLabel: `丢弃 ${draft.title}`,
          onClick: () => confirmDiscard(draft),
          attrs: { "data-focus-key": `discard-${draft.draftId}` },
        })
      );
      item.append(main, actionsWrap);
      list.append(item);
    }
    wrap.append(list);
    bodyEl.append(wrap);
  }

  function confirmDiscard(draft) {
    openModal({
      title: "丢弃这个行程？",
      description: draft.title,
      body: el("p", { class: "state-note", text: "只会删除本机保存的行程，不影响当前编辑。" }),
      actions: [
        { label: "取消", variant: "secondary" },
        {
          label: "丢弃",
          variant: "primary",
          onClick: () => actions.discardDraft(draft.draftId),
        },
      ],
    });
  }

  /* ---------- 面板底部 ---------- */

  function renderFoot(state) {
    clear(footEl);
    if (state.ui.view === "trips") return;

    if (state.ui.view === "ai") {
      renderAiInput(state);
      return;
    }

    const validation = validatePlan(state.plan, state.dataset.data);
    const loading = state.results.status === "loading";
    const disabled = !validation.valid || loading || state.dataset.status !== "ready";
    const button = createButton({
      variant: "primary",
      block: true,
      label: loading ? "正在查询车次" : "查询车次",
      disabled,
      onClick: () => actions.query(),
      attrs: { "data-focus-key": "query-button" },
    });
    if (loading) button.dataset.loading = "true";
    const hint = el("p", { class: "field-hint" });
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      hint.textContent = firstError;
    } else if (loading) {
      hint.textContent = "查询完成前不会覆盖当前方案";
    } else if (state.results.status === "stale") {
      hint.textContent = "条件已修改，需要重新查询";
    }
    footEl.append(hint, button);
  }

  function renderAiInput(state) {
    const area = el("div", { class: "ai-input-area" });
    const row = el("div", { class: "ai-input-row" });
    const textarea = el("textarea", {
      class: "ai-input",
      attrs: {
        id: "ai-input",
        rows: "1",
        placeholder: "想去哪里？",
        "aria-label": "输入出行想法",
        maxlength: "500",
      },
      dataset: { focusKey: "ai-input" },
      on: {
        input: (event) => {
          aiDraft = event.target.value;
          autoGrow(textarea);
        },
        keydown: (event) => {
          if (event.isComposing) return;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitAi();
          }
        },
      },
    });
    textarea.value = aiDraft;
    row.append(textarea);
    row.append(
      createButton({
        variant: "primary",
        label: "发送",
        iconName: "arrowRight",
        disabled: state.ui.ai.pending,
        onClick: () => submitAi(),
        attrs: { "data-focus-key": "ai-send" },
      })
    );
    area.append(row);
    footEl.append(area);
    requestAnimationFrame(() => autoGrow(textarea));
  }

  function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }

  function submitAi() {
    const text = aiDraft.trim();
    if (!text || getState().ui.ai.pending) return;
    actions.aiSend(text);
  }

  return { render };
}

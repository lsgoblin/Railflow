/* 共享 UI 原语：DOM 构造、按钮、标签、菜单、模态、toast、骨架、格式化。
 * 只负责表现与无障碍行为，不包含铁路业务规则。
 */

const FOCUSABLE = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const ICONS = {
  search:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M16 16l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  spark:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path></svg>',
  chevronDown:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  chevronUp:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  chevronLeft:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  plus:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  minus:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  fit:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  arrowUp:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  arrowDown:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  arrowRight:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  edit:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  warning:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4l9 16H3l9-16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M12 10v4M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  back:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  save:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4h11l3 3v13H5V4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path><path d="M8 4v6h8V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path></svg>',
  train:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="3" width="14" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="2"></rect><path d="M8 8h8M9 16l-2 4M15 16l2 4M9 20h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>',
  more:
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2" fill="currentColor"></circle><circle cx="12" cy="12" r="2" fill="currentColor"></circle><circle cx="19" cy="12" r="2" fill="currentColor"></circle></svg>',
};

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (props.dataset) {
    for (const [key, value] of Object.entries(props.dataset)) {
      if (value !== undefined && value !== null) node.dataset[key] = String(value);
    }
  }
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      node.addEventListener(event, handler);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function icon(name) {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = ICONS[name] ?? "";
  span.setAttribute("aria-hidden", "true");
  return span;
}

export function createButton(options = {}) {
  const {
    variant = "secondary",
    label = "",
    iconName = null,
    iconOnly = false,
    ariaLabel = null,
    title = null,
    disabled = false,
    loading = false,
    block = false,
    testid = null,
    onClick = null,
    type = "button",
    attrs = {},
  } = options;
  const classes = [iconOnly ? "icon-button" : "button", !iconOnly ? `button-${variant}` : ""];
  if (block) classes.push("button-block");
  const button = el("button", {
    class: classes.filter(Boolean).join(" "),
    attrs: {
      type,
      "aria-label": ariaLabel ?? null,
      title: title ?? null,
      disabled: disabled || loading ? true : null,
      "aria-busy": loading ? "true" : null,
      "aria-disabled": disabled ? "true" : null,
      ...attrs,
    },
    dataset: { testid },
  });
  if (iconOnly) {
    button.append(icon(iconName ?? "more"));
    if (ariaLabel) button.title = title ?? ariaLabel;
  } else {
    if (iconName) button.append(icon(iconName));
    if (label) button.append(el("span", { text: label }));
  }
  if (loading) button.dataset.loading = "true";
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

export function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.loading = "true";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (label) {
      const span = button.querySelector("span");
      if (span) span.textContent = label;
    }
  } else {
    delete button.dataset.loading;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (label) {
      const span = button.querySelector("span");
      if (span) span.textContent = label;
    }
  }
}

export function createTag(text, tone = "neutral", options = {}) {
  const tag = el("span", { class: `tag tag-${tone}`, text });
  if (options.title) tag.title = options.title;
  return tag;
}

export function skeletonLines(count = 1, widths = []) {
  const wrap = el("div", { attrs: { "aria-hidden": "true" } });
  for (let i = 0; i < count; i += 1) {
    wrap.append(el("div", { class: "skeleton skeleton-line", attrs: widths[i] ? { "data-width": widths[i] } : {} }));
  }
  return wrap;
}

export function skeletonBlock(height) {
  const block = el("div", { class: "skeleton skeleton-block", attrs: { "aria-hidden": "true" } });
  if (height) block.style.height = `${height}px`;
  return block;
}

export function emptyState(message, actions = []) {
  const wrap = el("div", { class: "empty-state" }, el("p", { class: "state-note", text: message }));
  if (actions.length) {
    const row = el("div", { class: "state-action" });
    for (const action of actions) row.append(action);
    wrap.append(row);
  }
  return wrap;
}

export function inlineError(message, action = null) {
  const wrap = el(
    "div",
    { class: "inline-error", attrs: { role: "alert" } },
    icon("warning"),
    el("p", { class: "inline-error-text", text: message })
  );
  if (action) wrap.append(action);
  return wrap;
}

export function inlineNote(message, tone = "default") {
  return el("p", { class: "inline-note", text: message, dataset: { tone } });
}

/* ---------- 菜单 ---------- */

let activeMenu = null;

export function openMenu(anchor, items, options = {}) {
  closeMenu({ restoreFocus: false });
  const menu = el("div", { class: "menu", attrs: { role: "menu" } });
  const rendered = [];

  for (const item of items) {
    if (item.separator) {
      menu.append(el("div", { class: "menu-separator", attrs: { role: "separator" } }));
      continue;
    }
    if (item.heading) {
      menu.append(el("p", { class: "menu-heading", text: item.heading }));
      continue;
    }
    const button = el("button", {
      class: "menu-item",
      attrs: {
        type: "button",
        role: "menuitemradio",
        "aria-checked": item.checked ? "true" : "false",
        disabled: item.disabled ? true : null,
        "aria-disabled": item.disabled ? "true" : null,
      },
      on: {
        click: () => {
          closeMenu({ restoreFocus: true });
          item.onSelect?.();
        },
      },
    });
    if (item.iconName) button.append(icon(item.iconName));
    button.append(el("span", { text: item.label }));
    if (item.checked) button.setAttribute("aria-checked", "true");
    menu.append(button);
    rendered.push(button);
  }

  document.getElementById("popover-root").append(menu);
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const gap = 8;
  let left = options.align === "end" ? anchorRect.right - menuRect.width : anchorRect.left;
  left = Math.max(12, Math.min(left, window.innerWidth - menuRect.width - 12));
  let top = options.placement === "up" ? anchorRect.top - menuRect.height - gap : anchorRect.bottom + gap;
  top = Math.max(12, Math.min(top, window.innerHeight - menuRect.height - 12));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  anchor.setAttribute("aria-expanded", "true");

  const focusables = rendered;
  focusables[0]?.focus({ preventScroll: true });

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }
    if (event.key === "Tab") {
      closeMenu({ restoreFocus: false });
      return;
    }
    const index = focusables.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusables[(index + 1 + focusables.length) % focusables.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusables[(index - 1 + focusables.length) % focusables.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      focusables[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      focusables[focusables.length - 1]?.focus();
    }
  };

  const onPointerDown = (event) => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) {
      closeMenu({ restoreFocus: false });
    }
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onPointerDown, true);

  activeMenu = {
    menu,
    anchor,
    detach() {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    },
  };
  return { close: () => closeMenu({ restoreFocus: true }) };
}

export function closeMenu({ restoreFocus = true } = {}) {
  if (!activeMenu) return;
  const { menu, anchor, detach } = activeMenu;
  activeMenu = null;
  detach();
  menu.remove();
  anchor?.setAttribute("aria-expanded", "false");
  if (restoreFocus) anchor?.focus({ preventScroll: true });
}

/* ---------- 模态 ---------- */

let activeModal = null;

export function openModal(options = {}) {
  closeModal({ restoreFocus: false });
  const root = document.getElementById("modal-root");
  const titleId = `modal-title-${Date.now().toString(36)}`;
  const descId = options.description ? `modal-desc-${Date.now().toString(36)}` : null;
  const previousFocus = options.previousFocus ?? document.activeElement;

  const title = el("h2", { class: "modal-title", attrs: { id: titleId }, text: options.title ?? "" });
  const head = el(
    "div",
    { class: "modal-head" },
    el(
      "div",
      {},
      title,
      options.description ? el("p", { class: "modal-title-desc", attrs: { id: descId }, text: options.description }) : null
    ),
    createButton({
      variant: "secondary",
      iconOnly: true,
      iconName: "close",
      ariaLabel: "关闭",
      onClick: () => closeModal(),
    })
  );
  const body = el("div", { class: "modal-body" }, options.body ?? "");
  const foot = el("div", { class: "modal-foot" });
  for (const action of options.actions ?? []) {
    const button = createButton({
      variant: action.variant ?? "secondary",
      label: action.label,
      onClick: () => {
        const result = action.onClick?.();
        if (action.close !== false && result !== false) closeModal();
      },
    });
    foot.append(button);
  }
  const modal = el(
    "div",
    {
      class: "modal",
      attrs: {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
        "aria-describedby": descId,
      },
      dataset: { size: options.size ?? "normal" },
    },
    head,
    body,
    foot
  );
  const backdrop = el("div", { class: "modal-backdrop" }, modal);
  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop) closeModal();
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = [...modal.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  root.append(backdrop);
  document.body.classList.add("modal-open");

  const initial = options.initialFocus ?? modal.querySelector(FOCUSABLE);
  initial?.focus({ preventScroll: true });
  activeModal = { backdrop, modal, previousFocus };
  return {
    close: () => closeModal(),
    modal,
    body,
  };
}

export function closeModal({ restoreFocus = true } = {}) {
  if (!activeModal) return;
  const { backdrop, previousFocus } = activeModal;
  activeModal = null;
  backdrop.remove();
  document.body.classList.remove("modal-open");
  if (restoreFocus && previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
}

/* ---------- toast ---------- */

let toastTimers = new Map();

export function showToast(message, options = {}) {
  const root = document.getElementById("toast-root");
  const toast = el(
    "div",
    { class: "toast", attrs: { role: options.tone === "error" ? "alert" : "status" }, dataset: { tone: options.tone ?? "default" } },
    el("p", { class: "toast-text", text: message }),
    createButton({
      variant: "secondary",
      iconOnly: true,
      iconName: "close",
      ariaLabel: "关闭提示",
      onClick: () => dismissToast(toast),
    })
  );
  toast.querySelector(".icon-button").classList.add("toast-close");
  while (root.children.length >= 2) dismissToast(root.firstElementChild);
  root.append(toast);
  const timer = window.setTimeout(() => dismissToast(toast), options.duration ?? 3600);
  toastTimers.set(toast, timer);
  return toast;
}

export function dismissToast(toast) {
  if (!toast) return;
  const timer = toastTimers.get(toast);
  if (timer) window.clearTimeout(timer);
  toastTimers.delete(toast);
  toast.remove();
}

/* ---------- 格式化（仅展示，不做业务推导） ---------- */

export function formatFare(amount, currency = "CNY") {
  if (amount === null || amount === undefined || amount === "") return "未知";
  const symbol = currency === "CNY" ? "¥" : "";
  const text = typeof amount === "number" ? amount.toFixed(2) : String(amount);
  return `${symbol}${text}`;
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return "未知";
  const total = Number(minutes);
  if (!Number.isFinite(total) || total < 0) return "未知";
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} 分`;
  if (mins === 0) return `${hours} 小时`;
  return `${hours} 小时 ${mins} 分`;
}

export function formatDateTime(date, time) {
  if (!date && !time) return "未知";
  if (date && time) return `${date} ${time}`;
  return date || time;
}

export function formatDayOffset(offset) {
  if (!offset) return "";
  return `+${offset} 天`;
}

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const CLOCK_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTimestamp(iso) {
  if (!iso) return "未知";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知";
  const parts = TIME_FORMATTER.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function formatClock(iso) {
  if (!iso) return "未知";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知";
  const parts = CLOCK_FORMATTER.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

/* ---------- 组件检查页（仅 ?dev=1） ---------- */

export function renderComponentGallery(container) {
  clear(container);

  const section = (title, ...rows) => {
    const node = el("section", { class: "gallery-section" }, el("h3", { class: "gallery-title", text: title }));
    for (const row of rows) node.append(row);
    return node;
  };
  const row = (...children) => el("div", { class: "gallery-row" }, ...children);
  const col = (label, ...children) => el("div", { class: "gallery-col" }, el("p", { class: "gallery-label", text: label }), ...children);

  container.append(
    section(
      "按钮",
      row(
        col(
          "默认 / 悬停 / 聚焦 / 禁用 / 加载",
          createButton({ variant: "primary", label: "查询车次" }),
          createButton({ variant: "primary", label: "正在查询", loading: true }),
          createButton({ variant: "primary", label: "禁用", disabled: true }),
          createButton({ variant: "secondary", label: "重试" }),
          createButton({ variant: "secondary", label: "禁用", disabled: true }),
          createButton({ variant: "ghost", label: "查看详情" }),
          createButton({ variant: "secondary", iconOnly: true, iconName: "plus", ariaLabel: "放大" }),
          createButton({ variant: "secondary", iconOnly: true, iconName: "more", ariaLabel: "更多", disabled: true })
        ),
        col(
          "键盘提示",
          el("p", { class: "gallery-label", text: "Tab 进入后聚焦环为 2px 主蓝；Enter/Space 触发。" }),
          el("p", { class: "gallery-label", text: "鼠标悬停或键盘聚焦时会显示对应状态。" })
        )
      )
    ),
    section(
      "输入框",
      row(
        col(
          "默认 / 聚焦 / 错误 / 禁用",
          el("div", { class: "field" }, el("label", { class: "field-label", text: "首次出发日期" }), el("input", { class: "input", type: "date", attrs: { value: "2026-11-17" } })),
          el("div", { class: "field" }, el("label", { class: "field-label", text: "停留天数" }), el("input", { class: "input", attrs: { value: "" } , "aria-invalid": "true" }), el("p", { class: "field-error", text: "停留天数需为正整数" })),
          el("div", { class: "field" }, el("label", { class: "field-label", text: "禁用输入" }), el("input", { class: "input", attrs: { value: "未开放", disabled: true } }))
        )
      )
    ),
    section(
      "页签与状态标签",
      row(
        col(
          "页签",
          el(
            "div",
            { class: "gallery-box" },
            el("div", { class: "panel-tabs", attrs: { role: "tablist", "aria-label": "示例页签" } },
              el("button", { class: "panel-tab", attrs: { type: "button", role: "tab", "aria-selected": "true" }, text: "路线" }),
              el("button", { class: "panel-tab", attrs: { type: "button", role: "tab", "aria-selected": "false" }, text: "AI 助手" })
            )
          )
        ),
        col(
          "标签",
          createTag("示例数据", "warning"),
          createTag("0 次换乘", "positive"),
          createTag("待重新计算", "warning"),
          createTag("轨迹缺失", "danger"),
          createTag("历史回放", "neutral"),
          createTag("选中", "primary")
        )
      )
    ),
    section(
      "菜单 / 模态 / Toast",
      row(
        col(
          "菜单",
          (() => {
            const anchor = createButton({ variant: "secondary", label: "打开菜单", iconName: "chevronDown" });
            anchor.addEventListener("click", () =>
              openMenu(
                anchor,
                [
                  { heading: "视野" },
                  { label: "全国", checked: true },
                  { label: "当前城市", checked: false },
                  { separator: true },
                  { label: "删除", disabled: true },
                ],
                { align: "start" }
              )
            );
            return anchor;
          })()
        ),
        col(
          "模态",
          createButton({
            variant: "secondary",
            label: "打开模态",
            onClick: () =>
              openModal({
                title: "丢弃修改？",
                description: "当前行程有未保存修改。",
                body: el("p", { class: "state-note", text: "丢弃后无法恢复本次修改。" }),
                actions: [
                  { label: "继续编辑", variant: "secondary" },
                  { label: "丢弃修改", variant: "primary" },
                ],
              }),
          })
        ),
        col(
          "Toast",
          createButton({ variant: "secondary", label: "成功提示", onClick: () => showToast("已保存到本机") }),
          createButton({ variant: "secondary", label: "错误提示", onClick: () => showToast("历史数据暂不可用", { tone: "error" }) })
        )
      )
    ),
    section(
      "骨架与空/错误状态",
      row(
        col("骨架", skeletonLines(3, ["medium", "", "short"])),
        col("加载区块", skeletonBlock(72)),
        col("空态", emptyState("未添加城市")),
        col("错误", inlineError("历史数据暂不可用", createButton({ variant: "secondary", label: "重试" })))
      )
    ),
    section(
      "抽屉（移动端三档）",
      row(
        col(
          "档位按钮",
          (() => {
            const wrap = el("div", { class: "gallery-row" });
            for (const [label, value] of [["折叠摘要", "collapsed"], ["半屏编辑", "half"], ["展开详情", "expanded"]]) {
              wrap.append(
                createButton({
                  variant: "secondary",
                  label,
                  onClick: () => {
                    const panel = document.getElementById("workspace-panel");
                    panel.dataset.drawer = value;
                    document.getElementById("app").dataset.drawer = value;
                  },
                })
              );
            }
            wrap.append(
              createButton({
                variant: "ghost",
                label: "关闭检查页",
                onClick: () => document.getElementById("modal-root").replaceChildren(),
              })
            );
            return wrap;
          })(),
          el("p", { class: "gallery-label", text: "桌面端抽屉按钮不生效；移动端可切换底部抽屉三档。" })
        )
      )
    )
  );
}

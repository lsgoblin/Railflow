import {
  api,
  STATIONS,
  ACTIONS,
  STATUS_LABELS,
  toDateStr,
  addDays,
  formatDateCN,
  formatDateTime,
  formatStamp,
  durationText,
  money,
  maskId,
  maskPhone,
  stationByCode,
  combineDateTime,
  round2
} from './mock.js';
import {
  MAP_VIEWBOX,
  MAP_CHINA_PATH,
  MAP_CONTEXT_PATH,
  MAP_STATIONS,
  MAP_ROUTES,
  mapProject
} from './map-data.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  user: null,
  route: null,
  searchDraft: {
    from: 'SHH',
    to: 'BJP',
    date: addDays(toDateStr(), 1)
  },
  search: { key: '', loading: false, data: null, error: '' },
  ai: { text: '', loading: false, hint: '', error: false, requestSeq: 0 },
  sort: 'depart',
  onlyAvailable: false,
  drawer: null,
  modal: null,
  toasts: [],
  menuOpen: false,
  ordersFilter: 'all',
  ordersQuery: '',
  adminTrainQuery: '',
  adminTrainFilter: 'all',
  adminOrderQuery: '',
  adminOrderFilter: 'all',
  adminLogFilter: 'all',
  payment: { orderId: null, method: '云闪付', processing: false, error: '' },
  auth: { mode: 'login', error: '', loading: false, draft: { email: '', password: '', name: '' } },
  lastFocus: null,
  focusAfterRender: null,
  expiring: false,
  lastRoutePath: ''
};

let toastSeq = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char];
  });
}

function icon(name, className = '') {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function logoMarkup() {
  return `<span class="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
      <path d="M9 6v20M23 6v20M9 12h14M9 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path>
      <circle cx="16" cy="16" r="3" fill="#c6482f"></circle>
    </svg>
  </span>`;
}

function statusChip(status) {
  const cls = {
    PENDING: 'status-pending',
    CONFIRMED: 'status-confirmed',
    CANCELLED: 'status-cancelled',
    EXPIRED: 'status-expired',
    REFUNDED: 'status-refunded'
  }[status] || 'status-cancelled';
  return `<span class="status-chip ${cls}">${esc(STATUS_LABELS[status] || status)}</span>`;
}

function actionLabel(action) {
  return ACTIONS[action] || action;
}

function actionTone(action) {
  if (['PAY', 'REFUND', 'SALES_ON', 'TRAIN_CREATE', 'TRAIN_UPDATE'].includes(action)) return 'is-positive';
  if (['PAY_FAIL', 'REFUND_FAIL', 'SALES_OFF'].includes(action)) return 'is-negative';
  return 'is-neutral';
}

function trainKind(no) {
  if (String(no).startsWith('G')) return '复兴号';
  if (String(no).startsWith('D')) return '动车组';
  if (String(no).startsWith('C')) return '城际';
  return '普速';
}

function countdownText(endMs) {
  const seconds = Math.max(0, Math.ceil((Number(endMs) - Date.now()) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function refundDeadline(order) {
  const departure = combineDateTime(order.travelDate, order.trainSnapshot.depart);
  return new Date(departure.getTime() - 30 * 60000);
}

function canRefund(order) {
  return order.status === 'CONFIRMED' && Date.now() < refundDeadline(order).getTime();
}

function canRebook(order) {
  const departure = combineDateTime(order.travelDate, order.trainSnapshot.depart);
  return departure.getTime() > Date.now();
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return {
    path: `/${parts.join('/')}`,
    parts,
    query: new URLSearchParams(queryPart),
    raw
  };
}

function navigate(path, params = null) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  const target = `#${path}${query}`;
  if (location.hash === target) {
    handleRoute();
  } else {
    location.hash = target;
  }
}

function getSearchParams() {
  const query = state.route?.query;
  const from = query?.get('from') || state.searchDraft.from;
  const to = query?.get('to') || state.searchDraft.to;
  const rawDate = query?.get('date');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || '') ? rawDate : state.searchDraft.date;
  return { from, to, date };
}

function searchKey(from, to, date) {
  return `${from}|${to}|${date}`;
}

function invalidateSearch() {
  state.search = { key: '', loading: false, data: null, error: '' };
}

function mapStation(code) {
  return MAP_STATIONS.find((station) => station.code === code) || MAP_STATIONS[0];
}

function formatCoord(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

function pageTitle() {
  const path = state.route?.path || '/';
  if (path === '/') return 'RailFlow · 铁路车票';
  if (path === '/search') return '查询结果 · RailFlow';
  if (path === '/orders') return '我的订单 · RailFlow';
  if (path.startsWith('/orders/')) return '订单详情 · RailFlow';
  if (path.startsWith('/pay/')) return '完成支付 · RailFlow';
  if (path === '/passengers') return '乘车人 · RailFlow';
  if (path.startsWith('/admin')) return '管理 · RailFlow';
  return 'RailFlow';
}

function toast(message, type = 'success') {
  const id = ++toastSeq;
  state.toasts.push({ id, message, type });
  if (state.toasts.length > 4) state.toasts.shift();
  renderToasts();
  setTimeout(() => {
    state.toasts = state.toasts.filter((t) => t.id !== id);
    renderToasts();
  }, type === 'error' ? 5200 : 3800);
}

function renderToasts() {
  const root = $('#toast-root');
  if (!root) return;
  root.innerHTML = state.toasts
    .map(
      (item) => `<div class="toast ${item.type === 'error' ? 'is-error' : ''}">
        ${icon(item.type === 'error' ? 'alert' : 'check-circle')}
        <span>${esc(item.message)}</span>
        <button class="toast-close" data-action="dismiss-toast" data-id="${item.id}" aria-label="关闭提示">${icon('x')}</button>
      </div>`
    )
    .join('');
}

function render() {
  if (!state.route) state.route = parseRoute();
  renderHeader();
  renderMobileNav();
  const app = $('#app');
  if (app) app.innerHTML = renderPage();
  renderOverlay();
  renderToasts();
  document.title = pageTitle();
  updateCountdowns();
  if (state.focusAfterRender) {
    const selector = state.focusAfterRender;
    state.focusAfterRender = null;
    requestAnimationFrame(() => {
      const el = $(selector);
      if (el) el.focus();
    });
  }
}

function renderHeader() {
  const path = state.route?.path || '/';
  const user = state.user;
  const ticketActive = path === '/' || path === '/search';
  const ordersActive = path === '/orders' || path.startsWith('/orders/') || path.startsWith('/pay/');
  const passengersActive = path === '/passengers';
  const adminActive = path.startsWith('/admin');
  const menu = state.menuOpen && user
    ? `<div class="account-menu" role="menu">
        <div class="account-menu-head">
          <strong>${esc(user.name)}</strong>
          <span>${esc(user.email)}</span>
        </div>
        <a class="menu-item" role="menuitem" href="#/passengers">${icon('users', 'icon-sm')}乘车人</a>
        ${user.role === 'admin' ? `<a class="menu-item" role="menuitem" href="#/admin/trains">${icon('shield', 'icon-sm')}管理后台</a>` : ''}
        <div class="menu-sep"></div>
        <button class="menu-item danger" role="menuitem" data-action="logout">${icon('logout', 'icon-sm')}退出登录</button>
      </div>`
    : '';

  const header = $('#site-header');
  if (!header) return;
  header.innerHTML = `<div class="header-inner">
    <a class="brand" href="#/" aria-label="RailFlow 首页">
      ${logoMarkup()}
      <span class="brand-word">RAILFLOW</span>
    </a>
    <nav class="main-nav" aria-label="主导航">
      <a href="#/" class="${ticketActive ? 'is-active' : ''}" ${ticketActive ? 'aria-current="page"' : ''}>车票</a>
      <a href="#/orders" class="${ordersActive ? 'is-active' : ''}" ${ordersActive ? 'aria-current="page"' : ''}>订单</a>
      <a href="#/passengers" class="${passengersActive ? 'is-active' : ''}" ${passengersActive ? 'aria-current="page"' : ''}>乘车人</a>
      ${user?.role === 'admin' ? `<a href="#/admin/trains" class="${adminActive ? 'is-active' : ''}" ${adminActive ? 'aria-current="page"' : ''}>管理</a>` : ''}
    </nav>
    <div class="header-account">
      ${
        user
          ? `<button class="account-btn" data-action="toggle-account" aria-haspopup="menu" aria-expanded="${state.menuOpen}">
              <span class="avatar">${esc(user.name.slice(0, 1))}</span>
              <span class="account-name">${esc(user.name)}</span>
              ${icon('chevron-down', 'icon-xs')}
            </button>${menu}`
          : `<button class="btn btn-ghost btn-sm" data-action="open-auth">登录</button>`
      }
    </div>
  </div>`;
}

function renderMobileNav() {
  const path = state.route?.path || '/';
  const user = state.user;
  const isAdmin = user?.role === 'admin';
  const items = [
    {
      label: '车票',
      iconName: 'search',
      href: '#/',
      active: path === '/' || path === '/search'
    },
    {
      label: '订单',
      iconName: 'ticket',
      href: user ? '#/orders' : null,
      action: user ? null : 'nav-auth',
      intentHref: '#/orders',
      active: path === '/orders' || path.startsWith('/orders/') || path.startsWith('/pay/')
    },
    isAdmin
      ? { label: '管理', iconName: 'shield', href: '#/admin/trains', active: path.startsWith('/admin') }
      : {
          label: '乘车人',
          iconName: 'users',
          href: user ? '#/passengers' : null,
          action: user ? null : 'nav-auth',
          intentHref: '#/passengers',
          active: path === '/passengers'
        },
    {
      label: user ? '账户' : '登录',
      iconName: 'user',
      href: null,
      action: user ? 'open-account' : 'open-auth',
      active: false
    }
  ];

  const nav = $('#mobile-nav');
  if (!nav) return;
  nav.innerHTML = items
    .map((item) => {
      const cls = `mobile-nav-item ${item.active ? 'is-active' : ''}`;
      if (item.href) {
        return `<a class="${cls}" href="${item.href}" ${item.active ? 'aria-current="page"' : ''}>
          ${icon(item.iconName)}<span>${item.label}</span>
        </a>`;
      }
      return `<button class="${cls}" data-action="${item.action}" ${item.action === 'nav-auth' ? `data-href="${item.intentHref || '#/orders'}"` : ''}>
        ${icon(item.iconName)}<span>${item.label}</span>
      </button>`;
    })
    .join('');
}

function renderPage() {
  const path = state.route?.path || '/';
  if (path === '/') return renderHome();
  if (path === '/search') return renderSearch();
  if (path === '/orders') return renderOrders();
  if (path.startsWith('/orders/')) return renderOrderDetail();
  if (path.startsWith('/pay/')) return renderPay();
  if (path === '/passengers') return renderPassengers();
  if (path.startsWith('/admin')) return renderAdmin();
  return renderNotFound();
}

function renderHome() {
  const attention = getAttentionOrder();
  const routes = api.getPopularRoutes().slice(0, 6);
  const tomorrow = addDays(toDateStr(), 1);

  return `<div class="home">
    <div class="container">
      <h1 class="sr-only">RailFlow 铁路车票</h1>
      ${attention ? tripStrip(attention) : ''}
      <section class="home-hero" aria-label="车票查询">
        ${searchCard('home')}
      </section>
      <section class="section" aria-labelledby="popular-title">
        <div class="section-head">
          <h2 id="popular-title">热门直达</h2>
          <span class="section-meta">二等座票价</span>
        </div>
        <div class="route-board">
          ${routes
            .map(
              (route) => `<a class="route-item" href="#/search?from=${route.from.code}&to=${route.to.code}&date=${tomorrow}">
                <span>
                  <span class="route-title">${esc(route.from.name)}${icon('arrow-right')}${esc(route.to.name)}</span>
                  <span class="route-sub">
                    <span>${durationText(route.durationMin)}</span>
                    <span class="dot"></span>
                    <span>每日 ${route.dailyCount} 班</span>
                    <span class="dot"></span>
                    <span>首班 ${route.firstDepart}</span>
                  </span>
                </span>
                <span class="route-price">${money(route.minPrice)}<span>起</span></span>
              </a>`
            )
            .join('')}
        </div>
      </section>
    </div>
  </div>`;
}

function getAttentionOrder() {
  if (!state.user) return null;
  try {
    const orders = api.getOrders(state.user.id);
    const pending = orders
      .filter((o) => o.status === 'PENDING')
      .sort((a, b) => a.lockedUntil.localeCompare(b.lockedUntil))[0];
    if (pending) return { ...pending, attentionType: 'PENDING' };
    const upcoming = orders
      .filter((o) => o.status === 'CONFIRMED' && canRebook(o))
      .sort((a, b) => a.travelDate.localeCompare(b.travelDate))[0];
    return upcoming ? { ...upcoming, attentionType: 'CONFIRMED' } : null;
  } catch {
    return null;
  }
}

function tripStrip(order) {
  const pending = order.attentionType === 'PENDING';
  return `<div class="trip-strip">
    <span class="trip-icon">${icon(pending ? 'clock' : 'train-front', 'icon-sm')}</span>
    <div class="trip-strip-main">
      <strong>${pending ? '待支付订单' : '下一段行程'} · ${esc(order.trainSnapshot.no)} ${esc(order.trainSnapshot.fromName)} → ${esc(order.trainSnapshot.toName)}</strong>
      <span>${formatDateCN(order.travelDate)} ${order.trainSnapshot.depart} 发车 · ${esc(order.passengerSnapshot.name)}</span>
    </div>
    ${
      pending
        ? `<span class="trip-time" data-countdown="${new Date(order.lockedUntil).getTime()}">${countdownText(new Date(order.lockedUntil).getTime())}</span>
           <button class="btn btn-dark btn-sm" data-action="go-pay" data-id="${esc(order.id)}">去支付</button>`
        : `<a class="btn btn-ghost btn-sm" href="#/orders/${esc(order.id)}">查看订单</a>`
    }
  </div>`;
}

function aiQueryMarkup() {
  const ai = state.ai;
  return `<form class="ai-query" data-form="ai-query">
    <div class="ai-query-head">
      <span class="ai-badge" aria-hidden="true">AI</span>
      <label for="ai-query-input">试试一句话查票</label>
    </div>
    <div class="ai-query-row">
      <input class="input ai-input ${ai.error ? 'is-error' : ''}" id="ai-query-input" name="q" type="text" value="${esc(ai.text)}" placeholder="例：明天下午去杭州" autocomplete="off" aria-invalid="${ai.error}" ${ai.hint ? 'aria-describedby="ai-query-hint"' : ''} ${ai.loading ? 'disabled' : ''} />
      <button class="btn btn-dark ai-submit" type="submit" ${ai.loading ? 'disabled' : ''}>${ai.loading ? '<span class="spinner"></span>解析中' : '帮我填'}</button>
    </div>
    ${ai.hint ? `<p class="ai-hint" id="ai-query-hint" role="status">${icon('check-circle', 'icon-xs')}${esc(ai.hint)}</p>` : ''}
  </form>`;
}

function searchCard(variant = 'home') {
  const draft = state.searchDraft;
  const from = stationByCode(draft.from) || STATIONS[0];
  const to = stationByCode(draft.to) || STATIONS[1];
  const today = toDateStr();
  const chips = [0, 1, 2].map((offset) => {
    const date = addDays(today, offset);
    const label = offset === 0 ? '今天' : offset === 1 ? '明天' : '后天';
    return `<button type="button" class="date-chip ${draft.date === date ? 'is-active' : ''}" data-action="set-date" data-date="${date}">${label}</button>`;
  });

  return `<div class="search-card ${variant === 'compact' ? 'compact' : ''}">
    ${
      variant === 'home'
        ? `<div class="search-card-head">
            <strong>车票查询</strong>
            <div class="search-scope"><span>直达</span><span class="dot"></span><span>成人 1 名</span><span class="dot"></span><span>二等座</span></div>
            <button class="text-btn map-link" data-action="open-map" data-field="from">${icon('map', 'icon-xs')}地图</button>
          </div>`
        : ''
    }
    ${variant === 'home' ? aiQueryMarkup() : ''}
    ${variant === 'home' ? '<div class="search-divider"><span>或手动选择</span></div>' : ''}
    <form class="search-form" data-form="search" novalidate>
      <div class="search-route">
        <button type="button" class="station-field" data-action="pick-station" data-field="from" aria-haspopup="dialog">
          <span class="field-label">出发</span>
          <span class="station-name">${esc(from.name)}</span>
          <span class="station-code">${esc(from.code)}</span>
        </button>
        <button type="button" class="swap-btn" data-action="swap-stations" aria-label="交换出发和到达站">${icon('swap')}</button>
        <button type="button" class="station-field" data-action="pick-station" data-field="to" aria-haspopup="dialog">
          <span class="field-label">到达</span>
          <span class="station-name">${esc(to.name)}</span>
          <span class="station-code">${esc(to.code)}</span>
        </button>
      </div>
      <div class="search-date">
        <label class="field-label" for="search-date">出发日期</label>
        <input class="date-input" id="search-date" type="date" name="date" min="${today}" value="${esc(draft.date)}" />
        <div class="date-chips">${chips.join('')}</div>
      </div>
      <button class="btn btn-primary search-submit" type="submit">${icon('search')}查询车次</button>
    </form>
  </div>`;
}

function renderSearch() {
  const { from, to, date } = getSearchParams();
  const fromStation = stationByCode(from) || STATIONS[0];
  const toStation = stationByCode(to) || STATIONS[1];
  const data = state.search.data;
  const loading = state.search.loading;
  const total = data?.trains.length ?? 0;
  const bookableCount = data?.trains.filter((t) => t.bookable).length ?? 0;

  let content = '';
  if (loading) {
    content = `<div class="skeleton-list" aria-label="正在查询车次" aria-busy="true">
      ${Array.from({ length: 3 })
        .map(
          () => `<div class="skeleton-row">
            <div class="skeleton-block tall"></div>
            <div><div class="skeleton-block wide"></div><div class="skeleton-block short" style="margin-top:10px"></div></div>
            <div class="skeleton-block tall"></div>
            <div class="skeleton-block"></div>
            <div class="skeleton-block"></div>
          </div>`
        )
        .join('')}
    </div>`;
  } else if (state.search.error) {
    content = `<div class="empty-state">
      <div class="empty-icon">${icon('alert')}</div>
      <h2>查询失败</h2>
      <p>${esc(state.search.error)}</p>
      <div class="empty-actions"><button class="btn btn-primary" data-action="retry-search">重新查询</button></div>
    </div>`;
  } else if (data) {
    const filtered = data.trains
      .filter((train) => !state.onlyAvailable || train.bookable)
      .sort((a, b) => {
        if (state.sort === 'price') return a.price - b.price;
        if (state.sort === 'seats') return b.available - a.available;
        return a.depart.localeCompare(b.depart);
      });

    if (!data.trains.length) {
      const suggestions = api
        .getPopularRoutes()
        .slice(0, 3)
        .map(
          (route) =>
            `<a class="suggestion-chip" href="#/search?from=${route.from.code}&to=${route.to.code}&date=${addDays(toDateStr(), 1)}">${esc(route.from.name)} → ${esc(route.to.name)}</a>`
        )
        .join('');
      content = `<div class="empty-state">
        <div class="empty-icon">${icon('train')}</div>
        <h2>没有找到直达车次</h2>
        <p>换个日期，或试试这些直达线路。</p>
        <div class="empty-suggestions">${suggestions}</div>
      </div>`;
    } else if (!filtered.length) {
      content = `<div class="empty-state">
        <div class="empty-icon">${icon('ticket')}</div>
        <h2>没有符合条件的车次</h2>
        <p>当前筛选下没有可预订的车次。</p>
        <div class="empty-actions"><button class="btn btn-ghost" data-action="clear-search-filter">清除筛选</button></div>
      </div>`;
    } else {
      content = `<div class="result-list">
        ${filtered.map((train) => renderTrainRow(train, fromStation.name, toStation.name, date)).join('')}
      </div>`;
    }
  }

  return `<div class="page">
    <div class="container">
      <div class="page-head">
        <div>
          <div class="crumb"><a href="#/">车票</a>${icon('chevron-right')}<span>查询结果</span></div>
          <h1 class="route-title">${esc(fromStation.name)}${icon('arrow-right')}${esc(toStation.name)}</h1>
          <p class="page-meta">${formatDateCN(date)}${data ? ` · ${total} 个直达车次 · ${bookableCount} 个可预订` : loading ? ' · 正在查询' : ''}</p>
        </div>
      </div>
      ${searchCard('compact')}
      <div class="results-toolbar">
        <div class="segmented" aria-label="排序方式">
          <button type="button" data-action="sort-results" data-sort="depart" class="${state.sort === 'depart' ? 'is-active' : ''}">出发时间</button>
          <button type="button" data-action="sort-results" data-sort="price" class="${state.sort === 'price' ? 'is-active' : ''}">价格</button>
          <button type="button" data-action="sort-results" data-sort="seats" class="${state.sort === 'seats' ? 'is-active' : ''}">余票</button>
        </div>
        <div class="results-tools-right">
          <label class="toggle-label">
            <input type="checkbox" data-action="toggle-available" ${state.onlyAvailable ? 'checked' : ''} />
            <span class="toggle-track" aria-hidden="true"></span>
            仅看有票
          </label>
          <button class="btn btn-ghost btn-sm map-toolbar-btn" data-action="open-map" data-field="to">${icon('map')}地图</button>
        </div>
      </div>
      ${content}
    </div>
  </div>`;
}

function renderTrainRow(train, fromName, toName, date) {
  let stockText = `余 ${train.available} 张`;
  let stockClass = train.available <= 5 ? 'low' : '';
  let ctaText = '预订';
  if (!train.salesOpen) {
    stockText = '停售';
    stockClass = 'off';
    ctaText = '不可预订';
  } else if (train.departed) {
    stockText = '已发车';
    stockClass = 'off';
    ctaText = '不可预订';
  } else if (train.available <= 0) {
    stockText = '无票';
    stockClass = 'off';
    ctaText = '不可预订';
  }

  const interactive = train.bookable;
  const actionAttrs = interactive
    ? `data-action="select-train" data-train="${esc(train.id)}" data-date="${esc(date)}" role="button" tabindex="0" aria-label="预订 ${esc(train.no)} ${esc(train.depart)} 出发"`
    : `aria-disabled="true"`;

  return `<article class="train-row ${interactive ? '' : 'is-disabled'}" ${actionAttrs}>
    <div class="train-time depart">
      <strong>${train.depart}</strong>
      <span>${esc(fromName)}</span>
    </div>
    <div class="train-journey">
      <span class="train-duration">${durationText(train.durationMin)}</span>
      <div class="rail-track">${icon('train')}</div>
      <span class="train-meta">${esc(train.no)} · ${trainKind(train.no)}</span>
    </div>
    <div class="train-time arrive">
      <strong>${train.arrive}</strong>
      <span>${esc(toName)}</span>
    </div>
    <div class="train-seat">
      <span class="seat-label">二等座</span>
      <span class="price">${money(train.price)}</span>
    </div>
    <span class="train-stock ${stockClass}">${stockText}</span>
    <span class="book-cta">${ctaText}</span>
  </article>`;
}

function renderOrders() {
  if (!state.user) {
    return authGate('登录后查看订单', '订单、退票与乘车人信息仅对本人可见。', location.hash || '#/orders');
  }

  let orders = [];
  let loadError = '';
  try {
    orders = api.getOrders(state.user.id);
  } catch (error) {
    loadError = error.message;
  }

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'PENDING').length,
    confirmed: orders.filter((o) => o.status === 'CONFIRMED').length,
    ended: orders.filter((o) => ['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(o.status)).length
  };

  const matchFilter = (order) => {
    if (state.ordersFilter === 'pending') return order.status === 'PENDING';
    if (state.ordersFilter === 'confirmed') return order.status === 'CONFIRMED';
    if (state.ordersFilter === 'ended') return ['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(order.status);
    return true;
  };

  const q = state.ordersQuery.trim().toLowerCase();
  const matchQuery = (order) => {
    if (!q) return true;
    return [
      order.id,
      order.trainSnapshot.no,
      order.trainSnapshot.fromName,
      order.trainSnapshot.toName,
      order.passengerSnapshot.name
    ]
      .join(' ')
      .toLowerCase()
      .includes(q);
  };

  const filtered = orders.filter((order) => matchFilter(order) && matchQuery(order));

  let content = '';
  if (loadError) {
    content = `<div class="empty-state"><div class="empty-icon">${icon('alert')}</div><h2>订单加载失败</h2><p>${esc(loadError)}</p></div>`;
  } else if (!orders.length) {
    content = `<div class="empty-state">
      <div class="empty-icon">${icon('ticket')}</div>
      <h2>还没有订单</h2>
      <p>查询直达车次，选好乘车人即可下单。</p>
      <div class="empty-actions"><a class="btn btn-primary" href="#/">查询车票</a></div>
    </div>`;
  } else if (!filtered.length) {
    content = `<div class="empty-state">
      <div class="empty-icon">${icon('search')}</div>
      <h2>没有匹配的订单</h2>
      <p>换个关键词或查看其他状态。</p>
      <div class="empty-actions"><button class="btn btn-ghost" data-action="clear-orders-filter">查看全部</button></div>
    </div>`;
  } else {
    content = `<div class="order-list">${filtered.map(renderOrderRow).join('')}</div>`;
  }

  return `<div class="page">
    <div class="container">
      <div class="page-head">
        <div>
          <h1>我的订单</h1>
          <p class="page-meta">${orders.length} 笔订单</p>
        </div>
        <div class="page-actions">
          <form class="search-inline" data-form="orders-search">
            ${icon('search')}
            <input class="input" type="search" name="q" value="${esc(state.ordersQuery)}" placeholder="搜索车次、乘车人或订单号" aria-label="搜索订单" />
          </form>
          <a class="btn btn-primary btn-sm" href="#/">${icon('plus')}去购票</a>
        </div>
      </div>
      <div class="order-tabs" aria-label="订单状态">
        ${[
          ['all', '全部', counts.all],
          ['pending', '待支付', counts.pending],
          ['confirmed', '已确认', counts.confirmed],
          ['ended', '已结束', counts.ended]
        ]
          .map(
            ([value, label, count]) => `<button class="order-tab ${state.ordersFilter === value ? 'is-active' : ''}" data-action="orders-filter" data-filter="${value}">
              ${label}<span class="tab-count">${count}</span>
            </button>`
          )
          .join('')}
      </div>
      ${content}
    </div>
  </div>`;
}

function renderOrderRow(order) {
  const pending = order.status === 'PENDING';
  const confirmed = order.status === 'CONFIRMED';
  const lockEnd = new Date(order.lockedUntil).getTime();
  const dateLabel = formatDateCN(order.travelDate, false);
  const weekday = formatDateCN(order.travelDate).split(' ')[1] || '';

  let actions = '';
  if (pending) {
    actions = `<button class="btn btn-dark btn-sm" data-action="go-pay" data-id="${esc(order.id)}">去支付</button>
      <button class="btn btn-quiet btn-sm" data-action="open-cancel" data-id="${esc(order.id)}" data-redirect="list">取消</button>`;
  } else if (confirmed && canRefund(order)) {
    actions = `<button class="btn btn-quiet btn-sm" data-action="open-refund" data-id="${esc(order.id)}">申请退票</button>`;
  } else if (confirmed) {
    actions = '';
  } else if (canRebook(order)) {
    actions = `<a class="btn btn-quiet btn-sm" href="#/search?from=${order.trainSnapshot.from}&to=${order.trainSnapshot.to}&date=${order.travelDate}">再次预订</a>`;
  }

  return `<div class="order-row">
    <a class="order-main" href="#/orders/${esc(order.id)}" aria-label="查看订单 ${esc(order.id)}">
      <span class="order-when">
        <strong>${dateLabel}</strong>
        <span>${weekday} · ${esc(order.trainSnapshot.no)}</span>
      </span>
      <span class="order-route">
        <span class="order-route-main">
          <span>${esc(order.trainSnapshot.fromName)}</span>
          ${icon('arrow-right')}
          <span>${esc(order.trainSnapshot.toName)}</span>
        </span>
        <span class="order-route-sub">${order.trainSnapshot.depart}–${order.trainSnapshot.arrive} · ${esc(order.seatClass)}</span>
      </span>
      <span class="order-passenger">${esc(order.passengerSnapshot.name)}<span>${maskId(order.passengerSnapshot.idNo)}</span></span>
      <span class="order-status">
        ${statusChip(order.status)}
        ${pending ? `<span class="order-countdown" data-countdown="${lockEnd}">${countdownText(lockEnd)}</span>` : ''}
      </span>
      <span class="order-amount">${money(order.amount)}</span>
    </a>
    ${actions ? `<div class="order-actions">${actions}</div>` : ''}
  </div>`;
}

function renderOrderDetail() {
  if (!state.user) {
    return authGate('登录后查看订单', '订单信息仅对本人可见。', location.hash || '#/orders');
  }

  const orderId = state.route.parts[1];
  let order;
  try {
    order = api.getOrder(state.user.id, orderId);
  } catch {
    return renderNotFound('订单不存在', '这笔订单可能已被移除，或链接有误。');
  }

  const logs = api.getOrderLogs(order.id);
  const paid = state.route.query.get('paid') === '1';
  const departure = combineDateTime(order.travelDate, order.trainSnapshot.depart);
  const deadline = refundDeadline(order);
  const isRefunded = order.status === 'REFUNDED';
  const isPending = order.status === 'PENDING';

  let note = '';
  if (isPending) {
    note = `<div class="detail-note"><strong>支付截止 ${formatDateTime(order.lockedUntil)}</strong>超时未支付，席位将自动释放。</div>`;
  } else if (order.status === 'CONFIRMED') {
    note = canRefund(order)
      ? `<div class="detail-note"><strong>退票截止 ${formatDateTime(deadline.toISOString())}</strong>退票手续费为票价的 10%，退款原路退回。</div>`
      : `<div class="detail-note"><strong>退票已截止</strong>订单仍可正常乘车。</div>`;
  } else if (isRefunded) {
    note = `<div class="detail-note"><strong>退款 ${money(order.refundAmount)}</strong>已退回原支付方式，手续费 ${money(order.refundFee)}。</div>`;
  } else {
    note = `<div class="detail-note"><strong>订单已结束</strong>席位已释放，可重新查询同线路车票。</div>`;
  }

  return `<div class="page">
    <div class="container">
      <div class="page-head">
        <div>
          <a class="back-link" href="#/orders">${icon('arrow-left')}我的订单</a>
          <h1>订单详情</h1>
          <p class="page-meta"><span class="mono">${esc(order.id)}</span> · ${formatDateTime(order.createdAt)}</p>
        </div>
        <div class="page-actions">${statusChip(order.status)}</div>
      </div>
      ${paid && order.status === 'CONFIRMED' ? `<div class="success-banner">
        <span class="success-icon">${icon('check', 'icon-sm')}</span>
        <div><strong>支付成功，车票已确认</strong><span>可在发车前 30 分钟前申请退票。</span></div>
      </div>` : ''}
      <div class="detail-grid">
        <div>
          <section class="ticket" aria-label="车票信息">
            <div class="ticket-head">
              <span>${esc(order.trainSnapshot.no)} · ${esc(order.seatClass)}</span>
              <span class="order-no">${esc(order.id)}</span>
            </div>
            <div class="ticket-route">
              <div class="ticket-station">
                <strong>${esc(order.trainSnapshot.fromName)}</strong>
                <span class="time">${order.trainSnapshot.depart}</span>
                <span class="date">${formatDateCN(order.travelDate)}</span>
              </div>
              <div class="ticket-journey">
                <span class="train-no">${esc(order.trainSnapshot.no)}</span>
                <span class="duration">${durationText(order.trainSnapshot.durationMin)}</span>
                <div class="line"></div>
              </div>
              <div class="ticket-station arrive">
                <strong>${esc(order.trainSnapshot.toName)}</strong>
                <span class="time">${order.trainSnapshot.arrive}</span>
                <span class="date">${formatDateCN(order.travelDate)}</span>
              </div>
            </div>
            <dl class="ticket-info">
              <div><dt>乘车人</dt><dd>${esc(order.passengerSnapshot.name)}<br><span class="mono muted">${maskId(order.passengerSnapshot.idNo)}</span></dd></div>
              <div><dt>席位</dt><dd>二等座 · 1 席</dd></div>
              <div><dt>支付方式</dt><dd>${esc(order.paymentMethod || '—')}</dd></div>
              <div><dt>手机号</dt><dd class="mono">${maskPhone(order.passengerSnapshot.phone)}</dd></div>
              <div><dt>下单时间</dt><dd>${formatDateTime(order.createdAt)}</dd></div>
              <div><dt>${isRefunded ? '退票手续费' : '订单状态'}</dt><dd>${isRefunded ? money(order.refundFee) : STATUS_LABELS[order.status]}</dd></div>
            </dl>
            ${
              isPending
                ? `<div class="pending-strip">
                    ${icon('clock', 'icon-sm')}
                    <span>支付剩余</span>
                    <strong data-countdown="${new Date(order.lockedUntil).getTime()}">${countdownText(new Date(order.lockedUntil).getTime())}</strong>
                    <button class="btn btn-dark btn-sm" data-action="go-pay" data-id="${esc(order.id)}">去支付</button>
                  </div>`
                : ''
            }
            <div class="barcode" aria-hidden="true"></div>
            <div class="ticket-foot">
              <div class="ticket-total">
                <span class="label">${isRefunded ? '退款金额' : '票价'}</span>
                <span class="amount">${isRefunded ? money(order.refundAmount) : money(order.amount)}</span>
              </div>
              <div class="ticket-actions">${orderActions(order)}</div>
            </div>
          </section>
        </div>
        <aside class="detail-side">
          <div class="timeline-card">
            <h2>订单记录</h2>
            <div class="timeline">${renderTimeline(logs)}</div>
          </div>
          ${note}
        </aside>
      </div>
    </div>
  </div>`;
}

function orderActions(order) {
  if (order.status === 'PENDING') {
    return `<button class="btn btn-primary" data-action="go-pay" data-id="${esc(order.id)}">去支付</button>
      <button class="btn btn-ghost" data-action="open-cancel" data-id="${esc(order.id)}" data-redirect="detail">取消订单</button>`;
  }
  if (order.status === 'CONFIRMED') {
    if (canRefund(order)) {
      return `<button class="btn btn-ghost" data-action="open-refund" data-id="${esc(order.id)}">申请退票</button>`;
    }
    return `<span class="tag">退票已截止</span>`;
  }
  if (canRebook(order)) {
    return `<a class="btn btn-ghost" href="#/search?from=${order.trainSnapshot.from}&to=${order.trainSnapshot.to}&date=${order.travelDate}">再次预订</a>`;
  }
  return '';
}

function renderTimeline(logs) {
  if (!logs.length) return `<div class="timeline-desc">暂无记录。</div>`;
  return logs
    .map((log, index) => {
      const transition = log.fromStatus && log.toStatus && log.fromStatus !== log.toStatus
        ? `${STATUS_LABELS[log.fromStatus] || log.fromStatus} → ${STATUS_LABELS[log.toStatus] || log.toStatus}`
        : '';
      const desc = [log.reason, transition].filter(Boolean).join(' · ');
      const fail = ['PAY_FAIL', 'REFUND_FAIL'].includes(log.action);
      const current = index === logs.length - 1;
      return `<div class="timeline-item ${fail ? 'is-fail' : ''} ${current ? 'is-current' : ''}">
        <span class="timeline-dot" aria-hidden="true"></span>
        <div>
          <div class="timeline-time">${formatDateTime(log.at)}</div>
          <div class="timeline-title">${esc(actionLabel(log.action))}</div>
          ${desc ? `<div class="timeline-desc">${esc(desc)}</div>` : ''}
        </div>
      </div>`;
    })
    .join('');
}

function renderPay() {
  if (!state.user) {
    return authGate('登录后完成支付', '订单信息仅对本人可见。', location.hash || '#/orders');
  }
  const orderId = state.route.parts[1];
  let order;
  try {
    order = api.getOrder(state.user.id, orderId);
  } catch {
    return renderNotFound('订单不存在', '这笔订单可能已被移除，或链接有误。');
  }

  if (order.status === 'PENDING' && Date.now() >= new Date(order.lockedUntil).getTime()) {
    api.sweepExpired();
    try {
      order = api.getOrder(state.user.id, orderId);
    } catch {
      return renderNotFound('订单不存在', '这笔订单可能已被移除，或链接有误。');
    }
  }

  if (order.status !== 'PENDING') return payState(order);
  if (state.payment.orderId !== order.id) {
    state.payment = { orderId: order.id, method: '云闪付', processing: false, error: '' };
  }

  const lockEnd = new Date(order.lockedUntil).getTime();
  const created = new Date(order.createdAt).getTime();
  const totalMs = Math.max(1, lockEnd - created);
  const remaining = Math.max(0, lockEnd - Date.now());
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
  const methods = [
    { name: '云闪付', desc: '银联卡快捷支付', iconName: 'card' },
    { name: '支付宝', desc: '跳转支付宝完成支付', iconName: 'wallet' },
    { name: '微信支付', desc: '微信扫码支付', iconName: 'chat' }
  ];

  return `<div class="page">
    <div class="container">
      <div class="page-head">
        <div>
          <a class="back-link" href="#/orders">${icon('arrow-left')}我的订单</a>
          <h1>完成支付</h1>
          <p class="page-meta"><span class="mono">${esc(order.id)}</span> · ${formatDateCN(order.travelDate)}</p>
        </div>
        <div class="page-actions">${statusChip('PENDING')}</div>
      </div>
      <div class="pay-grid">
        <section class="pay-ticket" aria-label="待支付订单">
          <div class="lock-label"><span class="lock-dot"></span>席位已锁定</div>
          <div class="countdown" data-countdown="${lockEnd}">${countdownText(lockEnd)}</div>
          <div class="lock-progress"><i data-lock-progress data-start="${created}" data-end="${lockEnd}" style="width:${pct}%"></i></div>
          <div class="pay-ticket-route">
            <div class="station">
              <strong>${esc(order.trainSnapshot.fromName)}</strong>
              <span>${order.trainSnapshot.depart} 发车</span>
            </div>
            <div class="journey">
              <span class="train-no">${esc(order.trainSnapshot.no)}</span>
              <div class="line"></div>
            </div>
            <div class="station arrive">
              <strong>${esc(order.trainSnapshot.toName)}</strong>
              <span>${order.trainSnapshot.arrive} 到达</span>
            </div>
          </div>
          <dl class="pay-ticket-info">
            <div><dt>乘车日期</dt><dd>${formatDateCN(order.travelDate)}</dd></div>
            <div><dt>乘车人</dt><dd>${esc(order.passengerSnapshot.name)}</dd></div>
            <div><dt>席位</dt><dd>二等座 · 1 席</dd></div>
            <div><dt>手机号</dt><dd class="mono">${maskPhone(order.passengerSnapshot.phone)}</dd></div>
            <div><dt>订单号</dt><dd class="mono">${esc(order.id)}</dd></div>
            <div><dt>锁座截止</dt><dd>${formatDateTime(order.lockedUntil)}</dd></div>
          </dl>
        </section>
        <section class="pay-panel" aria-label="支付方式">
          <div class="pay-total">
            <span>应付金额</span>
            <span class="amount">${money(order.amount)}</span>
          </div>
          <h2>支付方式</h2>
          <div class="pay-methods">
            ${methods
              .map(
                (method) => `<label class="pay-method ${state.payment.method === method.name ? 'is-selected' : ''}">
                  <input type="radio" name="pay-method" value="${method.name}" ${state.payment.method === method.name ? 'checked' : ''} />
                  <span class="method-icon">${icon(method.iconName)}</span>
                  <span class="method-main"><strong>${method.name}</strong><small>${method.desc}</small></span>
                  <span class="radio-mark" aria-hidden="true"></span>
                </label>`
              )
              .join('')}
          </div>
          ${state.payment.error ? `<div class="form-error" id="pay-error" tabindex="-1">${icon('alert')}<span>${esc(state.payment.error)}</span></div>` : ''}
          <button class="btn btn-primary btn-block btn-lg" data-action="pay-order" ${state.payment.processing ? 'disabled' : ''}>
            ${state.payment.processing ? `<span class="spinner"></span>支付处理中` : `确认支付 ${money(order.amount)}`}
          </button>
          <div class="pay-cancel">
            <button class="text-btn" data-action="open-cancel" data-id="${esc(order.id)}" data-redirect="pay">取消订单</button>
          </div>
          <p class="pay-note">支付成功后席位确认；超时未支付将自动释放。</p>
        </section>
      </div>
    </div>
  </div>`;
}

function payState(order) {
  const isExpired = order.status === 'EXPIRED';
  const isConfirmed = order.status === 'CONFIRMED';
  const title = isExpired
    ? '订单已超时'
    : isConfirmed
      ? '订单已支付'
      : order.status === 'CANCELLED'
        ? '订单已取消'
        : '订单已退款';
  const text = isExpired
    ? '锁座到期，席位已释放。'
    : isConfirmed
      ? '这笔订单已完成支付，可在订单详情查看车票。'
      : '这笔订单已结束，可重新查询同线路车票。';

  return `<div class="page">
    <div class="container">
      <div class="page-head">
        <div>
          <a class="back-link" href="#/orders">${icon('arrow-left')}我的订单</a>
          <h1>完成支付</h1>
        </div>
        <div class="page-actions">${statusChip(order.status)}</div>
      </div>
      <div class="pay-expired">
        <h2>${title}</h2>
        <p>${text}</p>
        <div class="empty-actions" style="justify-content:flex-start">
          <a class="btn btn-primary" href="#/orders/${esc(order.id)}">查看订单</a>
          ${canRebook(order) ? `<a class="btn btn-ghost" href="#/search?from=${order.trainSnapshot.from}&to=${order.trainSnapshot.to}&date=${order.travelDate}">重新查询</a>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

function renderPassengers() {
  if (!state.user) {
    return authGate('登录后管理乘车人', '乘车人信息仅对本人可见。', location.hash || '#/passengers');
  }

  let passengers = [];
  try {
    passengers = api.getPassengers(state.user.id);
  } catch (error) {
    return `<div class="page"><div class="container"><div class="empty-state"><div class="empty-icon">${icon('alert')}</div><h2>加载失败</h2><p>${esc(error.message)}</p></div></div></div>`;
  }

  const content = passengers.length
    ? `<div class="passenger-list">${passengers
        .map(
          (passenger) => `<div class="passenger-row">
            <span class="avatar avatar-light">${esc(passenger.name.slice(0, 1))}</span>
            <div class="passenger-row-name"><strong>${esc(passenger.name)}</strong><span>${esc(passenger.type)}</span></div>
            <div class="passenger-row-id">${maskId(passenger.idNo)}</div>
            <div class="passenger-row-phone">${maskPhone(passenger.phone)}</div>
            <div class="passenger-row-actions">
              <button class="icon-btn" data-action="edit-passenger" data-id="${esc(passenger.id)}" aria-label="编辑 ${esc(passenger.name)}">${icon('edit', 'icon-sm')}</button>
              <button class="icon-btn" data-action="delete-passenger" data-id="${esc(passenger.id)}" aria-label="删除 ${esc(passenger.name)}">${icon('trash', 'icon-sm')}</button>
            </div>
          </div>`
        )
        .join('')}</div>`
    : `<div class="empty-state">
        <div class="empty-icon">${icon('users')}</div>
        <h2>还没有乘车人</h2>
        <p>添加乘车人后即可为本人或同行人购票。</p>
        <div class="empty-actions"><button class="btn btn-primary" data-action="add-passenger">${icon('plus')}新增乘车人</button></div>
      </div>`;

  return `<div class="page">
    <div class="container">
      <div class="page-head">
        <div>
          <h1>乘车人</h1>
          <p class="page-meta">${passengers.length} 位乘车人</p>
        </div>
        <div class="page-actions"><button class="btn btn-primary btn-sm" data-action="add-passenger">${icon('plus')}新增乘车人</button></div>
      </div>
      ${content}
    </div>
  </div>`;
}

function renderAdmin() {
  if (!state.user) {
    return authGate('登录后进入管理', '请使用管理员账户登录。', location.hash || '#/admin/trains');
  }
  if (state.user.role !== 'admin') {
    return renderForbidden();
  }
  const active = state.route.parts[1] || 'trains';
  if (active === 'orders') return renderAdminOrders();
  if (active === 'logs') return renderAdminLogs();
  return renderAdminTrains();
}

function adminTabs(active) {
  const tabs = [
    ['trains', '车次', 'ticket'],
    ['orders', '订单', 'list'],
    ['logs', '操作记录', 'clock']
  ];
  return `<div class="admin-tabs" aria-label="管理导航">
    ${tabs
      .map(
        ([key, label, iconName]) =>
          `<a class="admin-tab ${active === key ? 'is-active' : ''}" href="#/admin/${key}" ${active === key ? 'aria-current="page"' : ''}>${icon(iconName, 'icon-sm')}${label}</a>`
      )
      .join('')}
  </div>`;
}

function renderAdminTrains() {
  const today = toDateStr();
  let trains = [];
  try {
    trains = api.getAdminTrains(today);
  } catch (error) {
    return `<div class="page"><div class="container"><div class="empty-state"><div class="empty-icon">${icon('alert')}</div><h2>加载失败</h2><p>${esc(error.message)}</p></div></div></div>`;
  }

  const q = state.adminTrainQuery.trim().toLowerCase();
  const filtered = trains.filter((train) => {
    if (state.adminTrainFilter === 'active' && !train.active) return false;
    if (state.adminTrainFilter === 'inactive' && train.active) return false;
    if (!q) return true;
    return [train.no, train.fromName, train.toName, train.from, train.to].join(' ').toLowerCase().includes(q);
  });

  const rows = filtered.length
    ? filtered
        .map(
          (train) => `<tr>
            <td>
              <span class="train-no">${esc(train.no)}</span>
              ${train.hasOrders ? `<span class="cell-sub"><span class="tag warn">有订单</span></span>` : ''}
            </td>
            <td>
              <div class="train-route-line">${esc(train.fromName)}${icon('arrow-right')}${esc(train.toName)}</div>
              <div class="train-times">${train.depart}–${train.arrive} · ${durationText(train.durationMin)}</div>
            </td>
            <td class="num">${money(train.price)}</td>
            <td class="num">${train.capacity}</td>
            <td class="num">${train.inventory.sold}</td>
            <td class="num">${train.inventory.locked}</td>
            <td class="num">${train.available}</td>
            <td>
              <button class="switch" role="switch" aria-checked="${train.active}" aria-label="${esc(train.no)} 销售状态" data-action="toggle-sales" data-id="${esc(train.id)}"></button>
            </td>
            <td>
              <div class="cell-actions">
                <button class="icon-btn bordered" data-action="edit-train" data-id="${esc(train.id)}" aria-label="编辑 ${esc(train.no)}">${icon('edit', 'icon-sm')}</button>
              </div>
            </td>
          </tr>`
        )
        .join('')
    : `<tr><td colspan="9"><div class="table-empty">没有匹配的车次</div></td></tr>`;

  return `<div class="page">
    <div class="container">
      <div class="page-head">
        <div><h1>车次管理</h1><p class="page-meta">${trains.length} 个车次 · 今日 ${formatDateCN(today)}</p></div>
        <div class="page-actions"><button class="btn btn-primary btn-sm" data-action="add-train">${icon('plus')}新增车次</button></div>
      </div>
      ${adminTabs('trains')}
      <div class="admin-toolbar">
        <div class="admin-toolbar-left">
          <form class="search-inline" data-form="admin-train-search">
            ${icon('search')}
            <input class="input" type="search" name="q" value="${esc(state.adminTrainQuery)}" placeholder="搜索车次或车站" aria-label="搜索车次" />
          </form>
          <div class="segmented" aria-label="销售状态筛选">
            <button type="button" data-action="admin-train-filter" data-filter="all" class="${state.adminTrainFilter === 'all' ? 'is-active' : ''}">全部</button>
            <button type="button" data-action="admin-train-filter" data-filter="active" class="${state.adminTrainFilter === 'active' ? 'is-active' : ''}">在售</button>
            <button type="button" data-action="admin-train-filter" data-filter="inactive" class="${state.adminTrainFilter === 'inactive' ? 'is-active' : ''}">停售</button>
          </div>
        </div>
        <div class="admin-toolbar-right"><span class="section-meta">容量、已售与锁定为今日数据</span></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>车次</th><th>区间 / 发到</th><th class="num">二等座</th><th class="num">容量</th><th class="num">已售</th><th class="num">锁定</th><th class="num">余票</th><th>销售</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderAdminOrders() {
  let orders = [];
  try {
    orders = api.getAdminOrders();
  } catch (error) {
    return `<div class="page"><div class="container"><div class="empty-state"><div class="empty-icon">${icon('alert')}</div><h2>加载失败</h2><p>${esc(error.message)}</p></div></div></div>`;
  }

  const q = state.adminOrderQuery.trim().toLowerCase();
  const filtered = orders.filter((order) => {
    if (state.adminOrderFilter === 'pending' && order.status !== 'PENDING') return false;
    if (state.adminOrderFilter === 'confirmed' && order.status !== 'CONFIRMED') return false;
    if (state.adminOrderFilter === 'ended' && !['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(order.status)) return false;
    if (!q) return true;
    return [
      order.id,
      order.user?.name,
      order.passengerSnapshot.name,
      order.trainSnapshot.no,
      order.trainSnapshot.fromName,
      order.trainSnapshot.toName
    ]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const rows = filtered.length
    ? filtered
        .map(
          (order) => `<tr>
            <td><span class="mono">${esc(order.id)}</span></td>
            <td>${esc(order.user?.name || '—')}<span class="cell-sub">${esc(order.user?.email || '')}</span></td>
            <td>${esc(order.passengerSnapshot.name)}<span class="cell-sub">${maskId(order.passengerSnapshot.idNo)}</span></td>
            <td><span class="train-no">${esc(order.trainSnapshot.no)}</span><span class="cell-sub">${esc(order.trainSnapshot.fromName)} → ${esc(order.trainSnapshot.toName)}</span></td>
            <td class="num">${formatDateCN(order.travelDate, false)}</td>
            <td class="num">${money(order.amount)}</td>
            <td>${statusChip(order.status)}</td>
            <td class="mono">${formatStamp(order.createdAt)}</td>
          </tr>`
        )
        .join('')
    : `<tr><td colspan="8"><div class="table-empty">没有匹配的订单</div></td></tr>`;

  return `<div class="page">
    <div class="container">
      <div class="page-head"><div><h1>订单管理</h1><p class="page-meta">${orders.length} 笔订单</p></div></div>
      ${adminTabs('orders')}
      <div class="admin-toolbar">
        <div class="admin-toolbar-left">
          <form class="search-inline" data-form="admin-order-search">
            ${icon('search')}
            <input class="input" type="search" name="q" value="${esc(state.adminOrderQuery)}" placeholder="搜索订单、用户或车次" aria-label="搜索订单" />
          </form>
          <div class="segmented" aria-label="订单状态筛选">
            ${[
              ['all', '全部'],
              ['pending', '待支付'],
              ['confirmed', '已确认'],
              ['ended', '已结束']
            ]
              .map(
                ([value, label]) =>
                  `<button type="button" data-action="admin-order-filter" data-filter="${value}" class="${state.adminOrderFilter === value ? 'is-active' : ''}">${label}</button>`
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>订单号</th><th>用户</th><th>乘车人</th><th>车次 / 区间</th><th class="num">乘车日期</th><th class="num">金额</th><th>状态</th><th>创建时间</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderAdminLogs() {
  let logs = [];
  try {
    logs = api.getLogs();
  } catch (error) {
    return `<div class="page"><div class="container"><div class="empty-state"><div class="empty-icon">${icon('alert')}</div><h2>加载失败</h2><p>${esc(error.message)}</p></div></div></div>`;
  }

  const filtered = logs.filter((log) => state.adminLogFilter === 'all' || log.action === state.adminLogFilter);
  const actionOptions = ['all', ...Object.keys(ACTIONS)]
    .map(
      (action) =>
        `<option value="${action}" ${state.adminLogFilter === action ? 'selected' : ''}>${action === 'all' ? '全部操作' : ACTIONS[action]}</option>`
    )
    .join('');

  const rows = filtered.length
    ? filtered
        .map((log) => {
          const transition = log.fromStatus && log.toStatus
            ? `${STATUS_LABELS[log.fromStatus] || log.fromStatus} → ${STATUS_LABELS[log.toStatus] || log.toStatus}`
            : '—';
          return `<tr>
            <td class="mono">${formatStamp(log.at)}</td>
            <td>${esc(log.actorName)}</td>
            <td><span class="log-action ${actionTone(log.action)}">${esc(actionLabel(log.action))}</span></td>
            <td>${log.order ? `<span class="mono">${esc(log.order.trainNo)}</span><span class="cell-sub">${esc(log.order.fromName)} → ${esc(log.order.toName)}</span>` : '—'}</td>
            <td>${esc(transition)}</td>
            <td><span class="log-reason">${esc(log.reason || '—')}</span></td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="6"><div class="table-empty">没有匹配的记录</div></td></tr>`;

  return `<div class="page">
    <div class="container">
      <div class="page-head"><div><h1>操作记录</h1><p class="page-meta">${logs.length} 条记录</p></div></div>
      ${adminTabs('logs')}
      <div class="admin-toolbar">
        <div class="admin-toolbar-left">
          <label class="sr-only" for="log-filter">筛选操作类型</label>
          <select class="select" id="log-filter" data-select="log-filter" style="height:36px;width:160px;font-size:12px">${actionOptions}</select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>订单 / 车次</th><th>状态变化</th><th>原因</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function authGate(title, text, intentHref) {
  return `<div class="page">
    <div class="container">
      <h1 class="sr-only">${esc(title)}</h1>
      <div class="empty-state">
        <div class="empty-icon">${icon('lock')}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div class="empty-actions">
          <button class="btn btn-primary" data-action="open-auth" data-intent-route="${esc(intentHref)}">登录</button>
          <a class="btn btn-ghost" href="#/">返回车票</a>
        </div>
      </div>
    </div>
  </div>`;
}

function renderForbidden() {
  return `<div class="page">
    <div class="container">
      <h1 class="sr-only">需要管理员权限</h1>
      <div class="empty-state">
        <div class="empty-icon">${icon('shield')}</div>
        <h2>需要管理员权限</h2>
        <p>当前账户无权访问管理页面。</p>
        <div class="empty-actions">
          <a class="btn btn-primary" href="#/">返回车票</a>
          <button class="btn btn-ghost" data-action="logout">切换账户</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderNotFound(title = '页面不存在', text = '链接可能已失效。') {
  return `<div class="page">
    <div class="container">
      <h1 class="sr-only">${esc(title)}</h1>
      <div class="empty-state">
        <div class="empty-icon">${icon('info')}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div class="empty-actions"><a class="btn btn-primary" href="#/">返回车票</a></div>
      </div>
    </div>
  </div>`;
}

function renderOverlay() {
  const drawerRoot = $('#drawer-root');
  const modalRoot = $('#modal-root');
  if (drawerRoot) drawerRoot.innerHTML = state.drawer ? drawerMarkup() : '';
  if (modalRoot) modalRoot.innerHTML = state.modal ? modalMarkup() : '';

  const drawer = drawerRoot?.querySelector('.drawer');
  if (drawer) drawer.inert = Boolean(state.modal);
  const shell = $('#shell');
  if (shell) shell.inert = Boolean(state.drawer || state.modal);
  document.body.classList.toggle('has-overlay', Boolean(state.drawer || state.modal));

  if (state.focusAfterRender) {
    const selector = state.focusAfterRender;
    state.focusAfterRender = null;
    requestAnimationFrame(() => {
      const el = $(selector);
      if (el) el.focus();
    });
  }
}

function drawerMarkup() {
  const d = state.drawer;
  const train = d.train;
  const passengers = d.passengers;
  const selected = d.passengerId;

  return `<div class="drawer-backdrop" data-action="drawer-backdrop"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <header class="drawer-head">
      <h2 id="drawer-title">确认订单</h2>
      <button class="icon-btn" data-action="close-drawer" aria-label="关闭">${icon('x')}</button>
    </header>
    <div class="drawer-body">
      <div class="drawer-trip">
        <div class="drawer-trip-meta">
          <span>${formatDateCN(d.date)} · ${esc(train.no)}</span>
          <span>二等座</span>
        </div>
        <div class="drawer-route">
          <div class="station"><strong>${esc(train.fromName)}</strong><span>${train.depart}</span></div>
          <div class="journey"><span class="train-no">${durationText(train.durationMin)}</span><div class="line"></div></div>
          <div class="station arrive"><strong>${esc(train.toName)}</strong><span>${train.arrive}</span></div>
        </div>
      </div>
      <div class="drawer-section">
        <div class="drawer-section-head">
          <h3>乘车人</h3>
          <button class="text-btn" data-action="add-passenger" data-return="drawer">${icon('plus', 'icon-xs')}新增</button>
        </div>
        ${
          passengers.length
            ? `<div class="passenger-list">${passengers
                .map(
                  (passenger) => `<label class="passenger-option ${selected === passenger.id ? 'is-selected' : ''}">
                    <input type="radio" name="passenger" value="${esc(passenger.id)}" ${selected === passenger.id ? 'checked' : ''} />
                    <span class="avatar avatar-light">${esc(passenger.name.slice(0, 1))}</span>
                    <span><span class="passenger-name">${esc(passenger.name)}</span><span class="passenger-meta">${maskId(passenger.idNo)}</span></span>
                    <span class="radio-mark" aria-hidden="true"></span>
                  </label>`
                )
                .join('')}</div>`
            : `<div class="drawer-empty"><p>还没有乘车人，添加后即可继续。</p><button class="btn btn-ghost btn-sm" data-action="add-passenger" data-return="drawer">${icon('plus')}新增乘车人</button></div>`
        }
      </div>
      <div class="drawer-summary">
        <div class="summary-row"><span>二等座</span><span class="mono">${money(train.price)}</span></div>
        <div class="summary-row"><span>服务费</span><span class="mono">¥0</span></div>
        <div class="summary-row total"><span>合计</span><span class="amount">${money(train.price)}</span></div>
      </div>
      ${d.error ? `<div class="form-error" id="drawer-error" tabindex="-1">${icon('alert')}<span>${esc(d.error)}</span></div>` : ''}
    </div>
    <footer class="drawer-foot">
      <button class="btn btn-primary btn-block btn-lg" data-action="submit-order" ${d.submitting || !selected ? 'disabled' : ''}>
        ${d.submitting ? `<span class="spinner"></span>提交中` : `提交订单 · ${money(train.price)}`}
      </button>
      <p class="drawer-note">提交后席位保留 10 分钟</p>
    </footer>
  </aside>`;
}

function modalMarkup() {
  const modal = state.modal;
  if (!modal) return '';
  if (modal.type === 'auth') return authModalMarkup();
  if (modal.type === 'station') return stationModalMarkup();
  if (modal.type === 'map') return mapModalMarkup();
  if (modal.type === 'passenger') return passengerModalMarkup();
  if (modal.type === 'confirm') return confirmModalMarkup();
  if (modal.type === 'refund') return refundModalMarkup();
  if (modal.type === 'train') return trainModalMarkup();
  if (modal.type === 'train-view') return trainViewMarkup();
  if (modal.type === 'account') return accountModalMarkup();
  return '';
}

function modalShell({ title, subtitle = '', body, footer = '', wide = false, narrow = false, className = '' }) {
  return `<div class="modal-backdrop" data-action="modal-backdrop">
    <section class="modal ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''} ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-head">
        <div><h2 id="modal-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
        <button class="icon-btn modal-close" data-action="close-modal" aria-label="关闭">${icon('x')}</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </section>
  </div>`;
}

function authModalMarkup() {
  const auth = state.auth;
  const modal = state.modal;
  const isLogin = modal.mode === 'login';
  const title = isLogin ? '登录 RailFlow' : '创建账户';
  const body = `<div class="auth-tabs">
      <button class="auth-tab ${isLogin ? 'is-active' : ''}" data-action="auth-mode" data-mode="login">登录</button>
      <button class="auth-tab ${!isLogin ? 'is-active' : ''}" data-action="auth-mode" data-mode="register">注册</button>
    </div>
    ${auth.error ? `<div class="form-error" id="modal-error" tabindex="-1">${icon('alert')}<span>${esc(auth.error)}</span></div>` : ''}
    ${
      isLogin
        ? `<form data-form="login">
            <div class="field"><label for="auth-email">邮箱</label><input class="input" id="auth-email" name="email" type="email" autocomplete="email" value="${esc(auth.draft.email)}" /></div>
            <div class="field"><label for="auth-password">密码</label><input class="input" id="auth-password" name="password" type="password" autocomplete="current-password" value="${esc(auth.draft.password)}" /></div>
            <button class="btn btn-primary btn-block btn-lg" type="submit" ${auth.loading ? 'disabled' : ''}>${auth.loading ? '<span class="spinner"></span>登录中' : '登录'}</button>
          </form>
          <div class="auth-switch">还没有账户？<button class="text-btn" data-action="auth-mode" data-mode="register">注册</button></div>`
        : `<form data-form="register">
            <div class="field"><label for="auth-name">姓名</label><input class="input" id="auth-name" name="name" type="text" autocomplete="name" value="${esc(auth.draft.name)}" /></div>
            <div class="field"><label for="auth-email">邮箱</label><input class="input" id="auth-email" name="email" type="email" autocomplete="email" value="${esc(auth.draft.email)}" /></div>
            <div class="field"><label for="auth-password">密码</label><input class="input" id="auth-password" name="password" type="password" autocomplete="new-password" value="${esc(auth.draft.password)}" /></div>
            <p class="form-hint" style="margin-bottom:14px">密码至少 6 个字符。</p>
            <button class="btn btn-primary btn-block btn-lg" type="submit" ${auth.loading ? 'disabled' : ''}>${auth.loading ? '<span class="spinner"></span>创建中' : '创建账户'}</button>
          </form>
          <div class="auth-switch">已有账户？<button class="text-btn" data-action="auth-mode" data-mode="login">登录</button></div>`
    }
    <div class="auth-demo">
      <span>快速进入</span>
      <button data-action="demo-login" data-role="user">购票账户</button>
      <button data-action="demo-login" data-role="admin">管理员账户</button>
    </div>`;
  return modalShell({ title, body, narrow: true });
}

function stationModalMarkup() {
  const modal = state.modal;
  const field = modal.field;
  const current = field === 'from' ? state.searchDraft.from : state.searchDraft.to;
  return modalShell({
    title: field === 'from' ? '选择出发站' : '选择到达站',
    body: `<div class="station-search-row">
        <div class="station-search">${icon('search')}<input class="input" data-input="station-search" value="${esc(modal.query)}" placeholder="搜索车站或拼音" aria-label="搜索车站" /></div>
        <button class="btn btn-ghost btn-sm" data-action="open-map" data-field="${field}">${icon('map')}地图</button>
      </div>
      <div class="station-list" id="station-list">${stationOptionsMarkup(modal.query, current)}</div>`,
    narrow: true
  });
}

function stationOptionsMarkup(query, selected) {
  const q = String(query || '').trim().toLowerCase();
  const list = STATIONS.filter((station) => {
    if (!q) return true;
    return `${station.name} ${station.city} ${station.code} ${station.pinyin}`.toLowerCase().includes(q);
  });
  if (!list.length) return `<div class="station-empty">没有找到车站</div>`;
  return list
    .map(
      (station) => `<button type="button" class="station-option ${selected === station.code ? 'is-selected' : ''}" data-action="choose-station" data-code="${station.code}">
        <span><strong>${esc(station.name)}</strong><span>${esc(station.city)} · ${esc(station.code)}</span></span>
        ${selected === station.code ? `<span class="check">${icon('check', 'icon-sm')}</span>` : ''}
      </button>`
    )
    .join('');
}

function mapRoutePath(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const curve = Math.min(38, length * 0.09);
  const controlX = midX - (dy / length) * curve;
  const controlY = midY + (dx / length) * curve;
  return `M${a.x} ${a.y}Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${b.x} ${b.y}`;
}

function renderMapSvg(focusCode) {
  const from = mapStation(state.searchDraft.from);
  const to = mapStation(state.searchDraft.to);
  const activeKey = [from.code, to.code].sort().join('-');
  const grid = [];

  for (let lon = 80; lon <= 130; lon += 10) {
    const [x] = mapProject(lon, 30);
    grid.push(`<line x1="${x.toFixed(1)}" y1="40" x2="${x.toFixed(1)}" y2="580"></line>`);
  }
  for (let lat = 20; lat <= 50; lat += 10) {
    const [, y] = mapProject(100, lat);
    grid.push(`<line x1="60" y1="${y.toFixed(1)}" x2="940" y2="${y.toFixed(1)}"></line>`);
  }

  const pairs = [...MAP_ROUTES];
  const currentPair = [from.code, to.code].sort().join('-');
  if (!pairs.some(([a, b]) => [a, b].sort().join('-') === currentPair)) {
    pairs.push([from.code, to.code]);
  }
  const routes = pairs
    .map(([aCode, bCode]) => {
      const a = mapStation(aCode);
      const b = mapStation(bCode);
      const active = [aCode, bCode].sort().join('-') === activeKey;
      return `<path class="${active ? 'is-active' : ''}" d="${mapRoutePath(a, b)}"></path>`;
    })
    .join('');

  const markers = MAP_STATIONS.map((station) => {
    const isFrom = station.code === from.code;
    const isTo = station.code === to.code;
    const isFocus = station.code === focusCode;
    const classes = [
      'map-marker',
      isFrom ? 'is-from' : '',
      isTo ? 'is-to' : '',
      isFocus ? 'is-focus' : ''
    ]
      .filter(Boolean)
      .join(' ');
    return `<g class="${classes}" data-action="map-focus" data-code="${station.code}" role="button" tabindex="0" aria-label="${esc(station.name)}">
      <title>${esc(station.name)} · ${esc(station.city)}</title>
      <circle class="map-hit" cx="${station.x}" cy="${station.y}" r="22"></circle>
      ${isFocus ? `<circle class="map-focus-ring" cx="${station.x}" cy="${station.y}" r="17"></circle>` : ''}
      <circle class="map-dot" cx="${station.x}" cy="${station.y}" r="8"></circle>
      <text class="map-code" x="${station.x + station.labelDx}" y="${station.y + station.labelDy}" text-anchor="${station.anchor}">${station.code}</text>
    </g>`;
  }).join('');

  return `<svg class="map-svg" viewBox="${MAP_VIEWBOX}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="RailFlow 车站地图">
    <rect class="map-water" x="0" y="0" width="1000" height="620"></rect>
    <g class="map-grid">${grid.join('')}</g>
    <path class="map-context" d="${MAP_CONTEXT_PATH}" fill-rule="evenodd"></path>
    <path class="map-country" d="${MAP_CHINA_PATH}" fill-rule="evenodd"></path>
    <g class="map-routes">${routes}</g>
    <g class="map-stations">${markers}</g>
  </svg>`;
}

function mapModalMarkup() {
  const modal = state.modal;
  const focus = mapStation(modal.focusCode);
  const from = mapStation(state.searchDraft.from);
  const to = mapStation(state.searchDraft.to);
  const isFrom = focus.code === from.code;
  const isTo = focus.code === to.code;

  const body = `<div class="map-layout">
    <div class="map-canvas">
      ${renderMapSvg(focus.code)}
      <span class="map-credit">示意地图 · Natural Earth</span>
    </div>
    <aside class="map-side">
      <div class="map-focus-card">
        <span class="map-focus-code">${focus.code}</span>
        <h3>${esc(focus.name)}</h3>
        <p>${esc(focus.city)} · ${formatCoord(focus.lat, focus.lon)}</p>
        <div class="map-focus-actions">
          <button class="btn btn-primary btn-sm" data-action="map-set" data-field="from" data-code="${focus.code}" ${isFrom ? 'disabled' : ''}>${isFrom ? '当前出发' : '设为出发'}</button>
          <button class="btn btn-ghost btn-sm" data-action="map-set" data-field="to" data-code="${focus.code}" ${isTo ? 'disabled' : ''}>${isTo ? '当前到达' : '设为到达'}</button>
        </div>
      </div>
      <div class="map-side-head"><span>车站</span><span>${MAP_STATIONS.length} 个</span></div>
      <div class="map-station-list">
        ${MAP_STATIONS.map((station) => {
          const active = station.code === focus.code;
          const stationFrom = station.code === from.code;
          const stationTo = station.code === to.code;
          return `<button class="map-station-item ${active ? 'is-active' : ''}" data-action="map-focus" data-code="${station.code}" aria-pressed="${active}">
            <span class="map-station-code">${station.code}</span>
            <span class="map-station-main"><strong>${esc(station.name)}</strong><small>${esc(station.city)}</small></span>
            ${stationFrom ? '<span class="tag">出发</span>' : stationTo ? '<span class="tag">到达</span>' : ''}
          </button>`;
        }).join('')}
      </div>
    </aside>
  </div>`;

  return modalShell({
    title: '地图选站',
    subtitle: `当前 ${from.name} → ${to.name}`,
    body,
    className: 'map-modal'
  });
}

function passengerModalMarkup() {
  const modal = state.modal;
  const draft = modal.draft;
  const editing = modal.mode === 'edit';
  const body = `${modal.error ? `<div class="form-error" id="modal-error" tabindex="-1">${icon('alert')}<span>${esc(modal.error)}</span></div>` : ''}
    <form id="passenger-form" data-form="passenger">
      <div class="field"><label for="passenger-name">姓名</label><input class="input" id="passenger-name" name="name" value="${esc(draft.name)}" autocomplete="name" /></div>
      <div class="field"><label for="passenger-id">证件号码</label><input class="input" id="passenger-id" name="idNo" value="${esc(draft.idNo)}" inputmode="text" autocomplete="off" /><span class="form-hint">仅支持 18 位居民身份证。</span></div>
      <div class="field"><label for="passenger-phone">手机号</label><input class="input" id="passenger-phone" name="phone" type="tel" value="${esc(draft.phone)}" autocomplete="tel" /></div>
    </form>`;
  return modalShell({
    title: editing ? '编辑乘车人' : '新增乘车人',
    body,
    footer: `<button class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit" form="passenger-form">保存</button>`
  });
}

function confirmModalMarkup() {
  const modal = state.modal;
  return modalShell({
    title: modal.title,
    body: `${modal.error ? `<div class="form-error" id="modal-error" tabindex="-1">${icon('alert')}<span>${esc(modal.error)}</span></div>` : ''}
      <p style="font-size:13px;line-height:1.7;color:var(--ink-2)">${esc(modal.body)}</p>`,
    footer: `<button class="btn btn-ghost" data-action="close-modal">返回</button><button class="btn btn-primary" data-action="confirm-modal" ${modal.loading ? 'disabled' : ''}>${modal.loading ? '<span class="spinner"></span>处理中' : esc(modal.confirmLabel)}</button>`,
    narrow: true
  });
}

function refundModalMarkup() {
  const modal = state.modal;
  const order = modal.order;
  return modalShell({
    title: '申请退票',
    body: `${modal.error ? `<div class="form-error" id="modal-error" tabindex="-1">${icon('alert')}<span>${esc(modal.error)}</span></div>` : ''}
      <div class="summary-row"><span>车次</span><span>${esc(order.trainSnapshot.no)} · ${formatDateCN(order.travelDate)}</span></div>
      <div class="summary-row"><span>票价</span><span class="mono">${money(order.amount)}</span></div>
      <div class="summary-row"><span>退票手续费（10%）</span><span class="mono">−${money(modal.fee)}</span></div>
      <div class="summary-row total"><span>退款金额</span><span class="amount">${money(modal.refundAmount)}</span></div>
      <p class="form-hint" style="margin-top:12px">退票截止 ${formatDateTime(modal.deadline)}，退款原路退回。</p>`,
    footer: `<button class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" data-action="confirm-refund" ${modal.loading ? 'disabled' : ''}>${modal.loading ? '<span class="spinner"></span>处理中' : '确认退票'}</button>`
  });
}

function trainModalMarkup() {
  const modal = state.modal;
  const draft = modal.draft;
  const editing = modal.mode === 'edit';
  const stationOptions = (selected) =>
    STATIONS.map((station) => `<option value="${station.code}" ${selected === station.code ? 'selected' : ''}>${esc(station.name)}</option>`).join('');
  const body = `${modal.error ? `<div class="form-error" id="modal-error" tabindex="-1">${icon('alert')}<span>${esc(modal.error)}</span></div>` : ''}
    <form id="train-form" data-form="train">
      <div class="field"><label for="train-no">车次号</label><input class="input" id="train-no" name="no" value="${esc(draft.no)}" placeholder="例如 G1234" ${editing ? 'readonly' : ''} /></div>
      <div class="form-row">
        <div class="field"><label for="train-from">出发站</label><select class="select" id="train-from" name="from">${stationOptions(draft.from)}</select></div>
        <div class="field"><label for="train-to">到达站</label><select class="select" id="train-to" name="to">${stationOptions(draft.to)}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="train-depart">发车时间</label><input class="input" id="train-depart" name="depart" type="time" value="${esc(draft.depart)}" /></div>
        <div class="field"><label for="train-arrive">到达时间</label><input class="input" id="train-arrive" name="arrive" type="time" value="${esc(draft.arrive)}" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="train-price">二等座票价</label><input class="input" id="train-price" name="price" type="number" min="0.5" step="0.5" value="${esc(draft.price)}" /></div>
        <div class="field"><label for="train-capacity">容量</label><input class="input" id="train-capacity" name="capacity" type="number" min="1" max="500" step="1" value="${esc(draft.capacity)}" /></div>
      </div>
      <p class="form-hint">新增车次默认开启销售；产生订单后仅可调整销售状态。</p>
    </form>`;
  return modalShell({
    title: editing ? '编辑车次' : '新增车次',
    body,
    footer: `<button class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit" form="train-form">保存</button>`,
    wide: true
  });
}

function trainViewMarkup() {
  const train = state.modal.train;
  return modalShell({
    title: `车次 ${train.no}`,
    body: `<div class="summary-row"><span>区间</span><span>${esc(train.fromName)} → ${esc(train.toName)}</span></div>
      <div class="summary-row"><span>发到</span><span class="mono">${train.depart}–${train.arrive} · ${durationText(train.durationMin)}</span></div>
      <div class="summary-row"><span>二等座</span><span class="mono">${money(train.price)}</span></div>
      <div class="summary-row"><span>容量</span><span class="mono">${train.capacity}</span></div>
      <div class="summary-row"><span>销售状态</span><span>${train.active ? '在售' : '停售'}</span></div>
      <div class="form-note" style="margin-top:16px">该车次已有订单，仅可调整销售状态。路线、时间、票价与容量不可修改。</div>`,
    footer: `<button class="btn btn-ghost" data-action="close-modal">关闭</button>`
  });
}

function accountModalMarkup() {
  const user = state.user;
  if (!user) return '';
  return modalShell({
    title: '账户',
    body: `<div class="account-sheet">
      <div class="account-sheet-head">
        <span class="avatar">${esc(user.name.slice(0, 1))}</span>
        <div><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span></div>
      </div>
      <div class="account-sheet-actions">
        <a class="menu-item" href="#/passengers">${icon('users', 'icon-sm')}乘车人</a>
        ${user.role === 'admin' ? `<a class="menu-item" href="#/admin/trains">${icon('shield', 'icon-sm')}管理后台</a>` : ''}
        <div class="menu-sep"></div>
        <button class="menu-item danger" data-action="logout">${icon('logout', 'icon-sm')}退出登录</button>
      </div>
    </div>`,
    narrow: true
  });
}

function openAuth(intent = null) {
  state.lastFocus = document.activeElement;
  state.auth = { mode: 'login', error: '', loading: false, draft: { email: '', password: '', name: '' } };
  state.modal = { type: 'auth', mode: 'login', intent };
  renderOverlay();
  focusOverlay();
}

function openStationPicker(field) {
  state.lastFocus = document.activeElement;
  state.modal = { type: 'station', field, query: '' };
  renderOverlay();
  focusOverlay();
}

function openMap(field = 'from') {
  state.lastFocus = document.activeElement;
  state.modal = {
    type: 'map',
    field,
    focusCode: field === 'to' ? state.searchDraft.to : state.searchDraft.from
  };
  renderOverlay();
  focusOverlay();
}

function openDrawer(trainId, date) {
  if (!state.user) {
    openAuth({ type: 'book', trainId, date });
    return;
  }
  let train;
  let passengers;
  try {
    train = api.getTrainDetails(trainId, date);
    passengers = api.getPassengers(state.user.id);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  if (!train.bookable) {
    toast('该车次当前不可预订。', 'error');
    return;
  }
  state.lastFocus = document.activeElement;
  state.drawer = {
    train,
    date,
    passengers,
    passengerId: passengers[0]?.id || null,
    error: '',
    submitting: false
  };
  renderOverlay();
  focusOverlay();
}

function refreshDrawer(passengerId = null) {
  if (!state.drawer || !state.user) return;
  try {
    const passengers = api.getPassengers(state.user.id);
    state.drawer = {
      ...state.drawer,
      passengers,
      passengerId: passengerId || state.drawer.passengerId || passengers[0]?.id || null
    };
  } catch {
    // Keep the current drawer if refresh fails.
  }
}

function openPassengerModal(passenger = null, returnTo = null) {
  if (!state.user) {
    openAuth({ type: 'route', href: '#/passengers' });
    return;
  }
  state.lastFocus = document.activeElement;
  state.modal = {
    type: 'passenger',
    mode: passenger ? 'edit' : 'add',
    passengerId: passenger?.id || null,
    returnTo,
    error: '',
    draft: {
      name: passenger?.name || '',
      idNo: passenger?.idNo || '',
      phone: passenger?.phone || ''
    }
  };
  renderOverlay();
  focusOverlay();
}

function openConfirm({ title, body, confirmLabel, action, orderId = null, passengerId = null, redirect = 'list' }) {
  state.lastFocus = document.activeElement;
  state.modal = {
    type: 'confirm',
    title,
    body,
    confirmLabel,
    action,
    orderId,
    passengerId,
    redirect,
    loading: false,
    error: ''
  };
  renderOverlay();
  focusOverlay();
}

function openRefundModal(orderId) {
  let order;
  try {
    order = api.getOrder(state.user.id, orderId);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  if (!canRefund(order)) {
    toast('已超过退票截止时间。', 'error');
    return;
  }
  const fee = round2(order.amount * 0.1);
  state.lastFocus = document.activeElement;
  state.modal = {
    type: 'refund',
    order,
    fee,
    refundAmount: round2(order.amount - fee),
    deadline: refundDeadline(order).toISOString(),
    loading: false,
    error: ''
  };
  renderOverlay();
  focusOverlay();
}

function openTrainModal(train = null) {
  if (!state.user || state.user.role !== 'admin') return;
  if (train?.hasOrders) {
    state.lastFocus = document.activeElement;
    state.modal = { type: 'train-view', train };
    renderOverlay();
    focusOverlay();
    return;
  }
  state.lastFocus = document.activeElement;
  state.modal = {
    type: 'train',
    mode: train ? 'edit' : 'add',
    trainId: train?.id || null,
    error: '',
    draft: {
      no: train?.no || '',
      from: train?.from || 'SHH',
      to: train?.to || 'BJP',
      depart: train?.depart || '08:00',
      arrive: train?.arrive || '12:00',
      price: train?.price ?? 500,
      capacity: train?.capacity ?? 100
    }
  };
  renderOverlay();
  focusOverlay();
}

function openAccountModal() {
  if (!state.user) {
    openAuth();
    return;
  }
  state.lastFocus = document.activeElement;
  state.modal = { type: 'account' };
  renderOverlay();
  focusOverlay();
}

function closeModal(restoreFocus = true) {
  const last = state.lastFocus;
  state.modal = null;
  renderOverlay();
  if (restoreFocus && last?.isConnected) {
    requestAnimationFrame(() => last.focus());
  }
}

function closeDrawer(restoreFocus = true) {
  const last = state.lastFocus;
  state.drawer = null;
  renderOverlay();
  if (restoreFocus && last?.isConnected) {
    requestAnimationFrame(() => last.focus());
  }
}

function focusOverlay() {
  requestAnimationFrame(() => {
    const root = state.modal ? $('#modal-root') : state.drawer ? $('#drawer-root') : null;
    if (!root) return;
    const body = root.querySelector('.modal-body, .drawer-body');
    const preferred =
      body?.querySelector('input:not([type="hidden"]), select, textarea, [role="button"], button, a[href]') ||
      root.querySelector('.modal-foot button') ||
      root.querySelector('button');
    if (preferred) preferred.focus();
  });
}

function setAuthLoading(loading) {
  if (!state.modal) return;
  state.auth.loading = loading;
  renderOverlay();
}

async function handleAuthSuccess(user, intent) {
  state.user = user;
  state.modal = null;
  state.auth = { mode: 'login', error: '', loading: false, draft: { email: '', password: '', name: '' } };
  render();
  toast(`已登录，${user.name}`);

  if (intent?.type === 'book') {
    openDrawer(intent.trainId, intent.date);
    return;
  }
  if (intent?.type === 'route' && intent.href) {
    if (location.hash === intent.href) {
      handleRoute();
    } else {
      location.hash = intent.href;
    }
    return;
  }
  if (user.role === 'admin' && (state.route.path === '/' || state.route.path === '/orders')) {
    navigate('/admin/trains');
  }
}

async function submitLogin(form) {
  const data = new FormData(form);
  state.auth.draft = {
    email: String(data.get('email') || ''),
    password: String(data.get('password') || ''),
    name: state.auth.draft.name
  };
  state.auth.error = '';
  state.auth.loading = true;
  renderOverlay();
  try {
    const user = await api.login(state.auth.draft.email, state.auth.draft.password);
    await handleAuthSuccess(user, state.modal?.intent);
  } catch (error) {
    state.auth.loading = false;
    state.auth.error = error.message;
    state.focusAfterRender = '#modal-error';
    renderOverlay();
  }
}

async function submitRegister(form) {
  const data = new FormData(form);
  state.auth.draft = {
    name: String(data.get('name') || ''),
    email: String(data.get('email') || ''),
    password: String(data.get('password') || '')
  };
  state.auth.error = '';
  state.auth.loading = true;
  renderOverlay();
  try {
    const user = await api.register(state.auth.draft);
    await handleAuthSuccess(user, state.modal?.intent);
  } catch (error) {
    state.auth.loading = false;
    state.auth.error = error.message;
    state.focusAfterRender = '#modal-error';
    renderOverlay();
  }
}

async function demoLogin(role) {
  const email = role === 'admin' ? 'admin@railflow.cn' : 'chen.yu@railflow.cn';
  const password = role === 'admin' ? 'admin123' : 'railflow123';
  state.auth.error = '';
  state.auth.loading = true;
  state.auth.draft = { email, password, name: '' };
  renderOverlay();
  try {
    const user = await api.login(email, password);
    await handleAuthSuccess(user, state.modal?.intent);
  } catch (error) {
    state.auth.loading = false;
    state.auth.error = error.message;
    renderOverlay();
  }
}

async function submitPassengerForm(form) {
  const modal = state.modal;
  if (!modal || modal.type !== 'passenger') return;
  const data = new FormData(form);
  modal.draft = {
    name: String(data.get('name') || ''),
    idNo: String(data.get('idNo') || ''),
    phone: String(data.get('phone') || '')
  };
  modal.error = '';
  renderOverlay();
  try {
    let saved;
    if (modal.mode === 'edit') {
      saved = await api.updatePassenger(state.user.id, modal.passengerId, modal.draft);
      toast('乘车人已更新');
    } else {
      saved = await api.addPassenger(state.user.id, modal.draft);
      toast('乘车人已添加');
    }
    const returnTo = modal.returnTo;
    state.modal = null;
    if (returnTo === 'drawer') {
      refreshDrawer(saved.id);
      renderOverlay();
      focusOverlay();
    } else {
      render();
    }
  } catch (error) {
    modal.error = error.message;
    state.focusAfterRender = '#modal-error';
    renderOverlay();
  }
}

async function submitTrainForm(form) {
  const modal = state.modal;
  if (!modal || modal.type !== 'train') return;
  const data = new FormData(form);
  modal.draft = {
    no: String(data.get('no') || ''),
    from: String(data.get('from') || ''),
    to: String(data.get('to') || ''),
    depart: String(data.get('depart') || ''),
    arrive: String(data.get('arrive') || ''),
    price: String(data.get('price') || ''),
    capacity: String(data.get('capacity') || '')
  };
  modal.error = '';
  renderOverlay();
  try {
    if (modal.mode === 'edit') {
      await api.updateTrain(modal.trainId, modal.draft, state.user.id);
      toast('车次已更新');
    } else {
      await api.createTrain(modal.draft, state.user.id);
      toast('车次已创建');
    }
    invalidateSearch();
    state.modal = null;
    render();
  } catch (error) {
    modal.error = error.message;
    state.focusAfterRender = '#modal-error';
    renderOverlay();
  }
}

async function submitOrder() {
  const d = state.drawer;
  if (!d || d.submitting) return;
  if (!state.user) {
    openAuth({ type: 'book', trainId: d.train.id, date: d.date });
    return;
  }
  if (!d.passengerId) {
    d.error = '请选择乘车人。';
    state.focusAfterRender = '#drawer-error';
    renderOverlay();
    return;
  }
  d.submitting = true;
  d.error = '';
  renderOverlay();
  try {
    const order = await api.createOrder({
      userId: state.user.id,
      trainId: d.train.id,
      travelDate: d.date,
      passengerId: d.passengerId
    });
    invalidateSearch();
    state.drawer = null;
    toast('订单已创建，席位已锁定');
    navigate(`/pay/${order.id}`);
  } catch (error) {
    d.submitting = false;
    d.error = error.message;
    state.focusAfterRender = '#drawer-error';
    renderOverlay();
  }
}

async function payOrder(forceFailure = false) {
  if (!state.user || state.payment.processing) return;
  const orderId = state.route.parts[1];
  state.payment.processing = true;
  state.payment.error = '';
  render();
  try {
    await api.payOrder(state.user.id, orderId, state.payment.method, { forceFailure });
    invalidateSearch();
    state.payment.processing = false;
    toast('支付成功，车票已确认');
    navigate(`/orders/${orderId}?paid=1`);
  } catch (error) {
    state.payment.processing = false;
    state.payment.error = error.message;
    state.focusAfterRender = '#pay-error';
    render();
  }
}

async function confirmModalAction(forceFailure = false) {
  const modal = state.modal;
  if (!modal || modal.loading) return;
  modal.loading = true;
  modal.error = '';
  renderOverlay();

  try {
    if (modal.action === 'cancel-order') {
      await api.cancelOrder(state.user.id, modal.orderId);
      invalidateSearch();
      const redirect = modal.redirect;
      state.modal = null;
      toast('订单已取消，席位已释放');
      if (redirect === 'pay') navigate(`/orders/${modal.orderId}`);
      else if (redirect === 'detail' && state.route.path.startsWith('/orders/')) render();
      else render();
      return;
    }
    if (modal.action === 'delete-passenger') {
      await api.deletePassenger(state.user.id, modal.passengerId);
      state.modal = null;
      toast('乘车人已删除');
      render();
      return;
    }
  } catch (error) {
    modal.loading = false;
    modal.error = error.message;
    state.focusAfterRender = '#modal-error';
    renderOverlay();
  }
}

async function confirmRefund(forceFailure = false) {
  const modal = state.modal;
  if (!modal || modal.type !== 'refund' || modal.loading) return;
  modal.loading = true;
  modal.error = '';
  renderOverlay();
  try {
    await api.refundOrder(state.user.id, modal.order.id, { forceFailure });
    invalidateSearch();
    state.modal = null;
    toast('退票成功，退款已提交');
    render();
  } catch (error) {
    modal.loading = false;
    modal.error = error.message;
    state.focusAfterRender = '#modal-error';
    renderOverlay();
  }
}

async function toggleSales(trainId) {
  if (!state.user || state.user.role !== 'admin') return;
  const trains = api.getAdminTrains(toDateStr());
  const train = trains.find((t) => t.id === trainId);
  if (!train) return;
  try {
    await api.setTrainSales(trainId, !train.active, state.user.id);
    invalidateSearch();
    toast(`${train.no} 已${train.active ? '停售' : '开售'}`);
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function focusFromStation() {
  const field = $('.station-field[data-field="from"]');
  if (!field) return;
  field.classList.add('is-ai-error-focus');
  field.focus();
  setTimeout(() => field.classList.remove('is-ai-error-focus'), 1800);
}

function highlightAiFields() {
  const fields = [
    $('.station-field[data-field="from"]'),
    $('.station-field[data-field="to"]'),
    $('#search-date')
  ].filter(Boolean);
  fields.forEach((field) => field.classList.add('is-ai-filled'));
  setTimeout(() => {
    fields.forEach((field) => field.classList.remove('is-ai-filled'));
  }, 1500);
}

function clearAiHint() {
  if (!state.ai.hint && !state.ai.error) return;
  state.ai.hint = '';
  state.ai.error = false;
  const hint = $('.ai-hint');
  if (hint) hint.remove();
  const input = $('#ai-query-input');
  if (input) {
    input.classList.remove('is-error');
    input.removeAttribute('aria-describedby');
    input.setAttribute('aria-invalid', 'false');
  }
}

async function submitAiQuery(form) {
  if (state.ai.loading) return;
  const input = form.querySelector('#ai-query-input');
  const text = String(input?.value || state.ai.text || '').trim();
  state.ai.text = text;
  state.ai.error = false;
  state.ai.hint = '';

  if (!text) {
    state.ai.error = true;
    render();
    toast('没听懂，请手动选择站点和日期', 'error');
    focusFromStation();
    return;
  }

  const seq = ++state.ai.requestSeq;
  state.ai.loading = true;
  render();

  let timeoutId;
  try {
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), 5000);
    });
    const result = await Promise.race([
      api.parseQuery(text, { defaultFrom: state.searchDraft.from }),
      timeout
    ]);
    if (seq !== state.ai.requestSeq) return;
    clearTimeout(timeoutId);

    const fromStation = STATIONS.find((station) => station.name === result.fromStation);
    const toStation = STATIONS.find((station) => station.name === result.toStation);
    if (!fromStation || !toStation) throw new Error('INVALID_RESULT');

    state.searchDraft = {
      from: fromStation.code,
      to: toStation.code,
      date: result.date
    };
    state.ai.loading = false;
    state.ai.hint = '已为你填好，可修改后查询';
    state.ai.error = false;
    render();
    highlightAiFields();
    const aiInput = $('#ai-query-input');
    if (aiInput) aiInput.focus();
  } catch {
    if (seq !== state.ai.requestSeq) return;
    clearTimeout(timeoutId);
    state.ai.loading = false;
    state.ai.hint = '';
    state.ai.error = true;
    render();
    toast('没听懂，请手动选择站点和日期', 'error');
    focusFromStation();
  }
}

function submitSearch() {
  const { from, to, date } = state.searchDraft;
  if (from === to) {
    toast('出发站和到达站不能相同。', 'error');
    return;
  }
  navigate('/search', { from, to, date });
}

function retrySearch() {
  const { from, to, date } = getSearchParams();
  const key = searchKey(from, to, date);
  state.search = { key, loading: true, data: null, error: '' };
  loadSearch(key);
  render();
}

async function loadSearch(key) {
  const [from, to, date] = key.split('|');
  try {
    const data = await api.searchTrains(from, to, date);
    if (state.search.key !== key) return;
    state.search = { key, loading: false, data, error: '' };
    if (state.route.path === '/search') render();
  } catch (error) {
    if (state.search.key !== key) return;
    state.search = { key, loading: false, data: null, error: error.message };
    if (state.route.path === '/search') render();
  }
}

function handleRoute() {
  const previous = state.route;
  const next = parseRoute();
  state.route = next;
  state.menuOpen = false;

  if (next.path !== '/') {
    if (state.ai.loading) {
      state.ai.requestSeq += 1;
      state.ai.loading = false;
    }
    state.ai.hint = '';
    state.ai.error = false;
  }

  if (previous && (previous.path !== next.path || previous.raw !== next.raw)) {
    state.modal = null;
    state.drawer = null;
  }

  if (next.path === '/search') {
    const { from, to, date } = getSearchParams();
    state.searchDraft = { from, to, date };
    const key = searchKey(from, to, date);
    if (state.search.key !== key) {
      state.search = { key, loading: true, data: null, error: '' };
      loadSearch(key);
    }
  }

  if (state.route.path !== state.lastRoutePath) {
    window.scrollTo(0, 0);
    state.lastRoutePath = state.route.path;
  }
  render();
}

function updateCountdowns() {
  const now = Date.now();
  let expired = false;

  $$('[data-countdown]').forEach((node) => {
    const end = Number(node.dataset.countdown);
    if (!Number.isFinite(end)) return;
    const remaining = end - now;
    node.textContent = countdownText(end);
    if (node.classList.contains('countdown')) {
      node.classList.toggle('is-urgent', remaining > 0 && remaining < 120000);
    }
    if (remaining <= 0) expired = true;
  });

  $$('[data-lock-progress]').forEach((node) => {
    const start = Number(node.dataset.start);
    const end = Number(node.dataset.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const pct = Math.max(0, Math.min(100, ((end - now) / (end - start)) * 100));
    node.style.width = `${pct}%`;
  });

  if (expired && !state.expiring) {
    state.expiring = true;
    api.sweepExpired();
    setTimeout(() => {
      state.expiring = false;
      if (!state.modal && !state.drawer) render();
    }, 120);
  }
}

function closeAccountMenuDom() {
  state.menuOpen = false;
  const menu = $('.account-menu');
  if (menu) menu.remove();
  const button = $('[data-action="toggle-account"]');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function handleClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) {
    if (state.menuOpen && !event.target.closest('.header-account')) {
      closeAccountMenuDom();
    }
    return;
  }
  const action = actionEl.dataset.action;

  if (state.menuOpen && action !== 'toggle-account' && !event.target.closest('.header-account')) {
    closeAccountMenuDom();
  }

  switch (action) {
    case 'skip-to-main':
      event.preventDefault();
      $('#app')?.focus();
      $('#app')?.scrollIntoView({ block: 'start' });
      break;
    case 'toggle-account':
      state.menuOpen = !state.menuOpen;
      renderHeader();
      break;
    case 'open-account':
      openAccountModal();
      break;
    case 'open-auth':
      openAuth(
        actionEl.dataset.intentRoute
          ? { type: 'route', href: actionEl.dataset.intentRoute }
          : null
      );
      break;
    case 'nav-auth':
      openAuth({ type: 'route', href: actionEl.dataset.href || '#/orders' });
      break;
    case 'logout':
      api.logout();
      state.user = null;
      state.menuOpen = false;
      state.modal = null;
      state.drawer = null;
      navigate('/');
      toast('已退出登录');
      break;
    case 'auth-mode':
      if (state.modal?.type === 'auth') {
        state.modal.mode = actionEl.dataset.mode;
        state.auth.error = '';
        state.auth.loading = false;
        renderOverlay();
        focusOverlay();
      }
      break;
    case 'demo-login':
      demoLogin(actionEl.dataset.role);
      break;
    case 'modal-backdrop':
      if (event.target === actionEl) closeModal();
      break;
    case 'drawer-backdrop':
      if (event.target === actionEl) closeDrawer();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'close-drawer':
      closeDrawer();
      break;
    case 'dismiss-toast':
      state.toasts = state.toasts.filter((t) => t.id !== Number(actionEl.dataset.id));
      renderToasts();
      break;
    case 'pick-station':
      openStationPicker(actionEl.dataset.field);
      break;
    case 'open-map':
      openMap(actionEl.dataset.field || 'from');
      break;
    case 'map-focus': {
      if (state.modal?.type !== 'map') break;
      const code = actionEl.dataset.code;
      state.modal.focusCode = code;
      state.focusAfterRender = `.map-station-item[data-code="${code}"]`;
      renderOverlay();
      break;
    }
    case 'map-set': {
      if (state.modal?.type !== 'map') break;
      const field = actionEl.dataset.field === 'to' ? 'to' : 'from';
      const code = actionEl.dataset.code;
      const other = field === 'from' ? 'to' : 'from';
      const previous = state.searchDraft[field];
      state.searchDraft[field] = code;
      if (state.searchDraft[other] === code) state.searchDraft[other] = previous;
      state.modal = null;
      clearAiHint();
      const wasSearch = state.route.path === '/search';
      state.focusAfterRender = `.station-field[data-field="${field}"]`;
      if (wasSearch) submitSearch();
      else render();
      toast(field === 'from' ? '出发站已更新' : '到达站已更新');
      break;
    }
    case 'choose-station': {
      const field = state.modal?.field;
      if (!field) break;
      const code = actionEl.dataset.code;
      const other = field === 'from' ? 'to' : 'from';
      const old = state.searchDraft[field];
      state.searchDraft[field] = code;
      if (state.searchDraft[other] === code) state.searchDraft[other] = old;
      state.modal = null;
      clearAiHint();
      const wasSearch = state.route.path === '/search';
      state.focusAfterRender = `.station-field[data-field="${field}"]`;
      if (wasSearch) submitSearch();
      else render();
      break;
    }
    case 'swap-stations': {
      const from = state.searchDraft.from;
      state.searchDraft.from = state.searchDraft.to;
      state.searchDraft.to = from;
      clearAiHint();
      if (state.route.path === '/search') submitSearch();
      else render();
      break;
    }
    case 'set-date': {
      state.searchDraft.date = actionEl.dataset.date;
      clearAiHint();
      if (state.route.path === '/search') {
        submitSearch();
      } else {
        render();
      }
      break;
    }
    case 'sort-results':
      state.sort = actionEl.dataset.sort;
      render();
      break;
    case 'clear-search-filter':
      state.onlyAvailable = false;
      render();
      break;
    case 'retry-search':
      retrySearch();
      break;
    case 'select-train':
      openDrawer(actionEl.dataset.train, actionEl.dataset.date);
      break;
    case 'add-passenger':
      openPassengerModal(null, actionEl.dataset.return || null);
      break;
    case 'edit-passenger': {
      try {
        const passengers = api.getPassengers(state.user.id);
        const passenger = passengers.find((p) => p.id === actionEl.dataset.id);
        if (passenger) openPassengerModal(passenger);
      } catch (error) {
        toast(error.message, 'error');
      }
      break;
    }
    case 'delete-passenger': {
      const passenger = state.user
        ? api.getPassengers(state.user.id).find((p) => p.id === actionEl.dataset.id)
        : null;
      if (!passenger) break;
      openConfirm({
        title: '删除乘车人',
        body: `确定删除 ${passenger.name} 吗？已有订单中的乘车人信息不会受到影响。`,
        confirmLabel: '删除',
        action: 'delete-passenger',
        passengerId: passenger.id
      });
      break;
    }
    case 'submit-order':
      submitOrder();
      break;
    case 'go-pay':
      navigate(`/pay/${actionEl.dataset.id}`);
      break;
    case 'open-cancel':
      openConfirm({
        title: '取消订单',
        body: '取消后席位将立即释放，订单无法恢复。',
        confirmLabel: '取消订单',
        action: 'cancel-order',
        orderId: actionEl.dataset.id,
        redirect: actionEl.dataset.redirect || 'list'
      });
      break;
    case 'open-refund':
      openRefundModal(actionEl.dataset.id);
      break;
    case 'confirm-modal':
      confirmModalAction(event.altKey);
      break;
    case 'confirm-refund':
      confirmRefund(event.altKey);
      break;
    case 'pay-order':
      payOrder(event.altKey);
      break;
    case 'orders-filter':
      state.ordersFilter = actionEl.dataset.filter;
      render();
      break;
    case 'clear-orders-filter':
      state.ordersFilter = 'all';
      state.ordersQuery = '';
      render();
      break;
    case 'admin-train-filter':
      state.adminTrainFilter = actionEl.dataset.filter;
      render();
      break;
    case 'admin-order-filter':
      state.adminOrderFilter = actionEl.dataset.filter;
      render();
      break;
    case 'add-train':
      openTrainModal();
      break;
    case 'edit-train': {
      try {
        const trains = api.getAdminTrains(toDateStr());
        const train = trains.find((t) => t.id === actionEl.dataset.id);
        if (train) openTrainModal(train);
      } catch (error) {
        toast(error.message, 'error');
      }
      break;
    }
    case 'toggle-sales':
      toggleSales(actionEl.dataset.id);
      break;
    default:
      break;
  }
}

function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;

  if (type === 'ai-query') {
    submitAiQuery(form);
    return;
  }
  if (type === 'search') {
    const data = new FormData(form);
    const date = data.get('date');
    if (date) state.searchDraft.date = String(date);
    submitSearch();
    return;
  }
  if (type === 'orders-search') {
    const data = new FormData(form);
    state.ordersQuery = String(data.get('q') || '').trim();
    render();
    return;
  }
  if (type === 'admin-train-search') {
    const data = new FormData(form);
    state.adminTrainQuery = String(data.get('q') || '').trim();
    render();
    return;
  }
  if (type === 'admin-order-search') {
    const data = new FormData(form);
    state.adminOrderQuery = String(data.get('q') || '').trim();
    render();
    return;
  }
  if (type === 'login') {
    submitLogin(form);
    return;
  }
  if (type === 'register') {
    submitRegister(form);
    return;
  }
  if (type === 'passenger') {
    submitPassengerForm(form);
    return;
  }
  if (type === 'train') {
    submitTrainForm(form);
  }
}

function handleChange(event) {
  const target = event.target;

  if (target.matches('[data-action="toggle-available"]')) {
    state.onlyAvailable = target.checked;
    render();
    return;
  }
  if (target.matches('.date-input')) {
    state.searchDraft.date = target.value;
    clearAiHint();
    if (state.route.path === '/search') {
      submitSearch();
    } else {
      render();
    }
    return;
  }
  if (target.matches('input[name="pay-method"]')) {
    state.payment.method = target.value;
    $$('.pay-method').forEach((el) => {
      el.classList.toggle('is-selected', el.querySelector('input')?.value === target.value);
    });
    return;
  }
  if (target.matches('input[name="passenger"]')) {
    if (state.drawer) state.drawer.passengerId = target.value;
    $$('.passenger-option').forEach((el) => {
      el.classList.toggle('is-selected', el.querySelector('input')?.value === target.value);
    });
    const button = $('[data-action="submit-order"]');
    if (button) button.disabled = false;
    return;
  }
  if (target.matches('[data-select="log-filter"]')) {
    state.adminLogFilter = target.value;
    render();
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.matches('#ai-query-input')) {
    state.ai.text = target.value;
    if (state.ai.hint || state.ai.error) clearAiHint();
    return;
  }
  if (target.matches('[data-input="station-search"]')) {
    state.modal.query = target.value;
    const list = $('#station-list');
    if (list) {
      const selected = state.modal.field === 'from' ? state.searchDraft.from : state.searchDraft.to;
      list.innerHTML = stationOptionsMarkup(state.modal.query, selected);
    }
  }
}

function handleKeydown(event) {
  if (event.key === 'Enter' && event.target.matches('#ai-query-input')) {
    event.preventDefault();
    event.target.closest('form')?.requestSubmit();
    return;
  }

  if (event.key === 'Escape') {
    if (state.modal) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (state.drawer) {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (state.menuOpen) {
      state.menuOpen = false;
      renderHeader();
      return;
    }
  }

  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action][role="button"]')) {
    event.preventDefault();
    event.target.click();
    return;
  }

  if (event.key === 'Tab' && (state.modal || state.drawer)) {
    const root = state.modal ? $('#modal-root') : $('#drawer-root');
    if (!root) return;
    const focusables = $$(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      root
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', handleRoute);
}

function init() {
  const params = new URLSearchParams(location.search);
  if (params.get('reset') === '1') {
    localStorage.removeItem('railflow.db.v1');
    localStorage.removeItem('railflow.session.v1');
    location.replace(`${location.pathname}#/`);
    return;
  }

  if (!location.hash) history.replaceState(null, '', '#/');
  state.user = api.getSession();
  api.sweepExpired();
  state.route = parseRoute();
  state.lastRoutePath = state.route.path;
  bindEvents();
  handleRoute();
  setInterval(updateCountdowns, 1000);
}

init();

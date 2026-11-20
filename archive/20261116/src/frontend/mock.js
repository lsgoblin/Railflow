/* RailFlow mock service: localStorage-backed, UI-independent. */

const DB_KEY = 'railflow.db.v1';
const SESSION_KEY = 'railflow.session.v1';

export const STATIONS = [
  { code: 'SHH', name: '上海虹桥', city: '上海', pinyin: 'shanghai hongqiao' },
  { code: 'BJP', name: '北京南', city: '北京', pinyin: 'beijing nan' },
  { code: 'HGH', name: '杭州东', city: '杭州', pinyin: 'hangzhou dong' },
  { code: 'GZQ', name: '广州南', city: '广州', pinyin: 'guangzhou nan' },
  { code: 'IOQ', name: '深圳北', city: '深圳', pinyin: 'shenzhen bei' },
  { code: 'TXP', name: '天津南', city: '天津', pinyin: 'tianjin nan' },
  { code: 'ICW', name: '成都东', city: '成都', pinyin: 'chengdu dong' },
  { code: 'CUW', name: '重庆北', city: '重庆', pinyin: 'chongqing bei' },
  { code: 'NKH', name: '南京南', city: '南京', pinyin: 'nanjing nan' },
  { code: 'WHN', name: '武汉', city: '武汉', pinyin: 'wuhan' }
];

const STATION_EXTRA_ALIASES = {
  SHH: ['沪', '虹桥'],
  BJP: ['京'],
  HGH: ['杭'],
  GZQ: ['穗'],
  IOQ: ['深'],
  TXP: ['津'],
  ICW: ['蓉'],
  CUW: ['渝'],
  NKH: ['宁'],
  WHN: ['汉']
};

const STATION_ALIAS_INDEX = STATIONS.flatMap((station) => {
  const aliases = new Set([
    station.name,
    `${station.name}站`,
    station.city,
    ...(STATION_EXTRA_ALIASES[station.code] || [])
  ]);
  return [...aliases].map((alias) => ({ alias, code: station.code }));
}).sort((a, b) => b.alias.length - a.alias.length);

const WEEKDAY_INDEX = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

const TRAIN_ROWS = [
  ['G2', 'SHH', 'BJP', '07:00', '11:36', 662, 96],
  ['G4', 'SHH', 'BJP', '09:00', '13:28', 662, 96],
  ['G6', 'SHH', 'BJP', '10:00', '14:28', 662, 96],
  ['G10', 'SHH', 'BJP', '14:00', '18:28', 662, 96],
  ['G18', 'SHH', 'BJP', '19:00', '23:28', 662, 96],
  ['G1', 'BJP', 'SHH', '07:00', '11:29', 662, 96],
  ['G3', 'BJP', 'SHH', '09:00', '13:29', 662, 96],
  ['G5', 'BJP', 'SHH', '11:00', '15:29', 662, 96],
  ['G7', 'BJP', 'SHH', '13:00', '17:29', 662, 96],
  ['G13', 'BJP', 'SHH', '18:00', '22:29', 662, 96],
  ['G7301', 'SHH', 'HGH', '06:30', '07:15', 73, 120],
  ['G7303', 'SHH', 'HGH', '08:10', '08:55', 73, 120],
  ['G7315', 'SHH', 'HGH', '17:40', '18:25', 73, 120],
  ['G7302', 'HGH', 'SHH', '07:20', '08:05', 73, 120],
  ['G7306', 'HGH', 'SHH', '12:10', '12:55', 73, 120],
  ['G7318', 'HGH', 'SHH', '19:30', '20:15', 73, 120],
  ['G1001', 'GZQ', 'IOQ', '08:00', '08:36', 74.5, 140],
  ['G1003', 'GZQ', 'IOQ', '12:20', '12:56', 74.5, 140],
  ['G1005', 'GZQ', 'IOQ', '18:40', '19:16', 74.5, 140],
  ['G1002', 'IOQ', 'GZQ', '08:30', '09:06', 74.5, 140],
  ['G1006', 'IOQ', 'GZQ', '15:10', '15:46', 74.5, 140],
  ['C2001', 'BJP', 'TXP', '06:50', '07:24', 54.5, 160],
  ['C2003', 'BJP', 'TXP', '12:15', '12:49', 54.5, 160],
  ['C2005', 'BJP', 'TXP', '18:20', '18:54', 54.5, 160],
  ['C2002', 'TXP', 'BJP', '07:40', '08:14', 54.5, 160],
  ['C2006', 'TXP', 'BJP', '17:35', '18:09', 54.5, 160],
  ['D5101', 'ICW', 'CUW', '08:05', '10:12', 154, 110],
  ['D5103', 'ICW', 'CUW', '14:20', '16:27', 154, 110],
  ['D5102', 'CUW', 'ICW', '09:10', '11:17', 154, 110],
  ['D5106', 'CUW', 'ICW', '18:05', '20:12', 154, 110],
  ['G7001', 'NKH', 'SHH', '07:15', '08:38', 139.5, 110],
  ['G7003', 'NKH', 'SHH', '13:10', '14:33', 139.5, 110],
  ['G7002', 'SHH', 'NKH', '09:05', '10:28', 139.5, 110],
  ['G7006', 'SHH', 'NKH', '18:15', '19:38', 139.5, 110],
  ['G1721', 'WHN', 'GZQ', '09:00', '13:12', 463.5, 96],
  ['G1722', 'GZQ', 'WHN', '14:00', '18:12', 463.5, 96]
];

const SEED_USERS = [
  {
    id: 'u-chenyu',
    name: '陈屿',
    email: 'chen.yu@railflow.cn',
    password: 'railflow123',
    role: 'user',
    phone: '13800138001',
    createdAt: '2026-09-18T09:20:00.000Z'
  },
  {
    id: 'u-linzhixia',
    name: '林知夏',
    email: 'lin.zhixia@railflow.cn',
    password: 'railflow123',
    role: 'user',
    phone: '13800138002',
    createdAt: '2026-10-02T13:10:00.000Z'
  },
  {
    id: 'u-zhouming',
    name: '周明',
    email: 'admin@railflow.cn',
    password: 'admin123',
    role: 'admin',
    phone: '13800138003',
    createdAt: '2026-08-01T08:00:00.000Z'
  }
];

const SEED_PASSENGERS = [
  {
    id: 'p-chenyu',
    userId: 'u-chenyu',
    name: '陈屿',
    idNo: '310101199203184512',
    phone: '13800138001',
    type: '成人',
    createdAt: '2026-09-18T09:24:00.000Z'
  },
  {
    id: 'p-shenqinghe',
    userId: 'u-chenyu',
    name: '沈清和',
    idNo: '310104199507226629',
    phone: '13800138011',
    type: '成人',
    createdAt: '2026-09-22T11:05:00.000Z'
  },
  {
    id: 'p-suyuan',
    userId: 'u-chenyu',
    name: '苏予安',
    idNo: '330106199811093345',
    phone: '13800138012',
    type: '成人',
    createdAt: '2026-10-08T16:40:00.000Z'
  },
  {
    id: 'p-linzhixia',
    userId: 'u-linzhixia',
    name: '林知夏',
    idNo: '110105199001127753',
    phone: '13800138002',
    type: '成人',
    createdAt: '2026-10-02T13:15:00.000Z'
  },
  {
    id: 'p-guqing',
    userId: 'u-linzhixia',
    name: '顾青',
    idNo: '510107199209155566',
    phone: '13800138021',
    type: '成人',
    createdAt: '2026-10-11T10:30:00.000Z'
  }
];

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export class ApiError extends Error {
  constructor(message, code = 'ERROR') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function toDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function combineDateTime(dateStr, timeStr) {
  const d = parseDate(dateStr);
  const [h, m] = String(timeStr).split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function formatDateCN(dateStr, withWeekday = true) {
  const d = parseDate(dateStr);
  const base = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withWeekday ? `${base} ${WEEKDAYS[d.getDay()]}` : base;
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatStamp(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

export function formatTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function durationText(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}小时${rest}分` : `${h}小时`;
}

export function money(value) {
  const n = Number(value) || 0;
  const formatted = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(n);
  return `¥${formatted}`;
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function maskId(id) {
  const s = String(id || '');
  if (s.length < 10) return s;
  return `${s.slice(0, 6)}${'*'.repeat(Math.max(0, s.length - 10))}${s.slice(-4)}`;
}

export function maskPhone(phone) {
  const s = String(phone || '');
  return s.length === 11 ? `${s.slice(0, 3)}****${s.slice(-4)}` : s;
}

export function validateIdNo(id) {
  const s = String(id || '').trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(s)) return false;
  const birth = s.slice(6, 14);
  const year = Number(birth.slice(0, 4));
  const month = Number(birth.slice(4, 6));
  const day = Number(birth.slice(6, 8));
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day ||
    year < 1900 ||
    birthDate > new Date()
  ) {
    return false;
  }
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += Number(s[i]) * weights[i];
  return codes[sum % 11] === s[17];
}

export function validatePhone(phone) {
  return /^1[3-9]\d{9}$/.test(String(phone || '').trim());
}

export function stationByCode(code) {
  return STATIONS.find((s) => s.code === code) || null;
}

function parseFailed() {
  throw new ApiError('没听懂，请手动选择站点和日期', 'PARSE_FAILED');
}

function normalizeQueryText(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[，,。.!！?？、；;：:]/g, '');
}

function findStationMentions(text) {
  const mentions = [];
  let index = 0;
  while (index < text.length) {
    const hit = STATION_ALIAS_INDEX.find((item) => text.startsWith(item.alias, index));
    if (hit) {
      mentions.push({
        code: hit.code,
        alias: hit.alias,
        start: index,
        end: index + hit.alias.length
      });
      index += hit.alias.length;
    } else {
      index += 1;
    }
  }
  return mentions;
}

function detectStationRole(text, mention) {
  const before = text.slice(Math.max(0, mention.start - 4), mention.start);
  const after = text.slice(mention.end, mention.end + 4);
  if (/从|由|自/.test(before)) return 'from';
  if (/去|到|往|回|飞|赴/.test(before)) return 'to';
  if (/出发|始发/.test(after)) return 'from';
  if (/到达|抵达/.test(after)) return 'to';
  return null;
}

function parseQueryDate(text) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const makeDate = (year, month, day) => {
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    const str = toDateStr(date);
    return str >= todayStr ? str : null;
  };

  let match = text.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})[日号]?/);
  if (match) return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/(\d{1,2})[月\-/.](\d{1,2})[日号]?/);
  if (match) return makeDate(today.getFullYear(), Number(match[1]), Number(match[2]));

  if (/大后天/.test(text)) return addDays(todayStr, 3);
  if (/后天/.test(text)) return addDays(todayStr, 2);
  if (/明天|明日/.test(text)) return addDays(todayStr, 1);
  if (/今天|今日/.test(text)) return todayStr;

  const nextWeekMatch = text.match(/(下周|下星期|下礼拜)([一二三四五六日天])/);
  if (nextWeekMatch) {
    const target = WEEKDAY_INDEX[nextWeekMatch[2]];
    const current = today.getDay();
    const daysToNextMonday = ((8 - current) % 7) || 7;
    const nextMonday = addDays(todayStr, daysToNextMonday);
    return addDays(nextMonday, target === 0 ? 6 : target - 1);
  }

  const thisWeekMatch = text.match(/(本周|这周|本星期|这星期|本礼拜|这礼拜)([一二三四五六日天])/);
  if (thisWeekMatch) {
    const target = WEEKDAY_INDEX[thisWeekMatch[2]];
    const current = today.getDay();
    const mondayOffset = (current + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset);
    const date = new Date(monday);
    date.setDate(monday.getDate() + (target === 0 ? 6 : target - 1));
    const str = toDateStr(date);
    return str >= todayStr ? str : null;
  }

  const weekdayMatch = text.match(/(?:周|星期|礼拜)([一二三四五六日天])/);
  if (weekdayMatch) {
    const target = WEEKDAY_INDEX[weekdayMatch[1]];
    const current = today.getDay();
    return addDays(todayStr, (target - current + 7) % 7);
  }

  const dayOnlyMatch = text.match(/(\d{1,2})[日号]/);
  if (dayOnlyMatch) {
    return makeDate(today.getFullYear(), today.getMonth() + 1, Number(dayOnlyMatch[1]));
  }

  return null;
}

function parseQueryText(text, options = {}) {
  const normalized = normalizeQueryText(text);
  if (!normalized) parseFailed();

  const date = parseQueryDate(normalized);
  if (!date) parseFailed();

  const mentions = findStationMentions(normalized);
  if (!mentions.length || mentions.length > 2) parseFailed();

  const roles = mentions.map((mention) => ({
    ...mention,
    role: detectStationRole(normalized, mention)
  }));

  if (roles.filter((item) => item.role === 'from').length > 1) parseFailed();
  if (roles.filter((item) => item.role === 'to').length > 1) parseFailed();

  let from = roles.find((item) => item.role === 'from');
  let to = roles.find((item) => item.role === 'to');
  const unassigned = roles.filter((item) => !item.role);

  if (!from && !to && roles.length === 2) {
    from = roles[0];
    to = roles[1];
  } else {
    if (!from && to && unassigned.length === 1) from = unassigned[0];
    if (!to && from && unassigned.length === 1) to = unassigned[0];
  }

  // Destination-only phrases reuse the origin currently shown in the form;
  // the parser never invents a station when no context is available.
  if (!from && to && options.defaultFrom) {
    const fallback =
      stationByCode(options.defaultFrom) ||
      STATIONS.find((station) => station.name === options.defaultFrom || station.city === options.defaultFrom);
    if (fallback) from = { code: fallback.code };
  }

  if (!from || !to || from.code === to.code) parseFailed();

  return {
    fromStation: stationByCode(from.code).name,
    toStation: stationByCode(to.code).name,
    date
  };
}

function hashString(value) {
  let hash = 5381;
  const str = String(value);
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function trainDuration(depart, arrive) {
  const [dh, dm] = depart.split(':').map(Number);
  const [ah, am] = arrive.split(':').map(Number);
  return ah * 60 + am - (dh * 60 + dm);
}

function buildTrains() {
  return TRAIN_ROWS.map(([no, from, to, depart, arrive, price, capacity]) => ({
    id: no,
    no,
    from,
    to,
    depart,
    arrive,
    durationMin: trainDuration(depart, arrive),
    price,
    capacity,
    active: true,
    seeded: true,
    createdAt: '2026-08-01T08:00:00.000Z'
  }));
}

function nextOrderId(db, travelDate) {
  const prefix = `RF${travelDate.replace(/-/g, '')}`;
  const used = db.orders
    .filter((o) => o.id.startsWith(prefix))
    .map((o) => Number(o.id.slice(prefix.length)) || 0);
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

function ensureInventoryIn(db, train, date) {
  const key = `${train.id}:${date}`;
  let inv = db.inventory[key];
  if (!inv) {
    const seed = hashString(key);
    const today = toDateStr();
    const daysOut = Math.max(0, Math.round((parseDate(date) - parseDate(today)) / 86400000));
    const base = 0.16 + (seed % 40) / 100;
    const pressure = Math.max(0, 1 - Math.min(daysOut, 12) / 12);
    const ratio = Math.min(0.78, base + pressure * 0.14);
    const sold = train.seeded === false ? 0 : Math.min(train.capacity, Math.round(train.capacity * ratio));
    const locked = train.seeded === false
      ? 0
      : Math.min(
          Math.max(0, train.capacity - sold),
          Math.floor((train.capacity * ((seed >>> 8) % 5)) / 100)
        );
    inv = { trainId: train.id, date, capacity: train.capacity, sold, locked };
    db.inventory[key] = inv;
  } else if (inv.capacity !== train.capacity) {
    inv.capacity = train.capacity;
  }
  return inv;
}

function addLog(db, entry) {
  db.logs.push({
    id: `L${(db.logSeq += 1)}`,
    at: new Date(entry.at).toISOString(),
    actorId: entry.actorId || null,
    actorName: entry.actorName || '系统',
    action: entry.action,
    orderId: entry.orderId || null,
    fromStatus: entry.fromStatus || null,
    toStatus: entry.toStatus || null,
    reason: entry.reason || ''
  });
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

function createDb() {
  const now = new Date();
  const today = toDateStr(now);
  const tomorrow = addDays(today, 1);

  const db = {
    version: 1,
    users: SEED_USERS.map((u) => ({ ...u })),
    passengers: SEED_PASSENGERS.map((p) => ({ ...p })),
    trains: buildTrains(),
    orders: [],
    logs: [],
    inventory: {},
    logSeq: 0
  };

  const g6 = db.trains.find((t) => t.id === 'G6');
  const g6Inv = ensureInventoryIn(db, g6, tomorrow);
  g6Inv.sold = Math.max(0, g6Inv.capacity - 4);
  g6Inv.locked = 0;

  const g7301 = db.trains.find((t) => t.id === 'G7301');
  const g7301Inv = ensureInventoryIn(db, g7301, tomorrow);
  g7301Inv.sold = g7301Inv.capacity;
  g7301Inv.locked = 0;

  const seedOrder = (spec) => {
    const train = db.trains.find((t) => t.id === spec.trainId);
    const passenger = db.passengers.find((p) => p.id === spec.passengerId);
    const user = db.users.find((u) => u.id === spec.userId);
    if (!train || !passenger || !user) return null;

    const createdAt = new Date(now.getTime() + spec.createdOffsetMin * 60000);
    const departure = combineDateTime(spec.travelDate, train.depart);
    const defaultLock = new Date(createdAt.getTime() + 10 * 60000);
    const lockedUntil =
      spec.lockOffsetMin != null
        ? new Date(now.getTime() + spec.lockOffsetMin * 60000)
        : new Date(Math.min(defaultLock.getTime(), departure.getTime()));

    const paidAt =
      spec.paidOffsetMin != null ? new Date(createdAt.getTime() + spec.paidOffsetMin * 60000) : null;
    const refundedAt =
      spec.refundedOffsetMin != null
        ? new Date(createdAt.getTime() + spec.refundedOffsetMin * 60000)
        : null;
    const cancelledAt =
      spec.cancelledOffsetMin != null
        ? new Date(createdAt.getTime() + spec.cancelledOffsetMin * 60000)
        : null;
    const expiredAt = spec.status === 'EXPIRED' ? lockedUntil : null;

    const fee = round2(train.price * 0.1);
    const order = {
      id: nextOrderId(db, spec.travelDate),
      userId: user.id,
      passengerId: passenger.id,
      passengerSnapshot: {
        name: passenger.name,
        idNo: passenger.idNo,
        phone: passenger.phone,
        type: passenger.type
      },
      trainId: train.id,
      trainSnapshot: {
        no: train.no,
        from: train.from,
        to: train.to,
        fromName: stationByCode(train.from).name,
        toName: stationByCode(train.to).name,
        depart: train.depart,
        arrive: train.arrive,
        durationMin: train.durationMin,
        price: train.price
      },
      travelDate: spec.travelDate,
      seatClass: '二等座',
      amount: train.price,
      status: spec.status,
      createdAt: createdAt.toISOString(),
      lockedUntil: lockedUntil.toISOString(),
      paidAt: paidAt ? paidAt.toISOString() : null,
      cancelledAt: cancelledAt ? cancelledAt.toISOString() : null,
      expiredAt: expiredAt ? expiredAt.toISOString() : null,
      refundedAt: refundedAt ? refundedAt.toISOString() : null,
      refundFee: refundedAt ? fee : null,
      refundAmount: refundedAt ? round2(train.price - fee) : null,
      paymentMethod: paidAt ? spec.paymentMethod || '云闪付' : null,
      cancelReason: cancelledAt ? spec.cancelReason || '行程有变' : null
    };

    const inv = ensureInventoryIn(db, train, spec.travelDate);
    if (spec.status === 'PENDING') inv.locked = Math.min(inv.capacity, inv.locked + 1);
    if (spec.status === 'CONFIRMED') inv.sold = Math.min(inv.capacity, inv.sold + 1);

    db.orders.push(order);

    addLog(db, {
      at: createdAt,
      actorId: user.id,
      actorName: user.name,
      action: 'LOCK',
      orderId: order.id,
      toStatus: 'PENDING',
      reason: '席位锁定 10 分钟'
    });

    if (paidAt) {
      addLog(db, {
        at: paidAt,
        actorId: user.id,
        actorName: user.name,
        action: 'PAY',
        orderId: order.id,
        fromStatus: 'PENDING',
        toStatus: 'CONFIRMED',
        reason: `${spec.paymentMethod || '云闪付'}支付成功`
      });
    }

    if (spec.status === 'PENDING') {
      addLog(db, {
        at: new Date(now.getTime() - 60000),
        actorId: user.id,
        actorName: user.name,
        action: 'PAY_FAIL',
        orderId: order.id,
        fromStatus: 'PENDING',
        toStatus: 'PENDING',
        reason: '支付渠道返回失败'
      });
    }

    if (refundedAt) {
      addLog(db, {
        at: refundedAt,
        actorId: user.id,
        actorName: user.name,
        action: 'REFUND',
        orderId: order.id,
        fromStatus: 'CONFIRMED',
        toStatus: 'REFUNDED',
        reason: `扣除手续费 ${money(fee)}，退款 ${money(train.price - fee)}`
      });
    }

    if (cancelledAt) {
      addLog(db, {
        at: cancelledAt,
        actorId: user.id,
        actorName: user.name,
        action: 'CANCEL',
        orderId: order.id,
        fromStatus: 'PENDING',
        toStatus: 'CANCELLED',
        reason: order.cancelReason
      });
    }

    if (expiredAt) {
      addLog(db, {
        at: expiredAt,
        actorId: null,
        actorName: '系统',
        action: 'EXPIRE',
        orderId: order.id,
        fromStatus: 'PENDING',
        toStatus: 'EXPIRED',
        reason: '锁座到期未支付'
      });
    }

    return order;
  };

  seedOrder({
    userId: 'u-chenyu',
    passengerId: 'p-shenqinghe',
    trainId: 'G6',
    travelDate: tomorrow,
    status: 'PENDING',
    createdOffsetMin: -2,
    lockOffsetMin: 8
  });
  seedOrder({
    userId: 'u-chenyu',
    passengerId: 'p-chenyu',
    trainId: 'G7303',
    travelDate: tomorrow,
    status: 'CONFIRMED',
    createdOffsetMin: -1440,
    paidOffsetMin: 3
  });
  seedOrder({
    userId: 'u-chenyu',
    passengerId: 'p-suyuan',
    trainId: 'G1',
    travelDate: addDays(today, 3),
    status: 'CONFIRMED',
    createdOffsetMin: -300,
    paidOffsetMin: 4
  });
  seedOrder({
    userId: 'u-linzhixia',
    passengerId: 'p-linzhixia',
    trainId: 'G1003',
    travelDate: tomorrow,
    status: 'CONFIRMED',
    createdOffsetMin: -900,
    paidOffsetMin: 2,
    paymentMethod: '支付宝'
  });
  seedOrder({
    userId: 'u-chenyu',
    passengerId: 'p-chenyu',
    trainId: 'G1005',
    travelDate: addDays(today, -2),
    status: 'REFUNDED',
    createdOffsetMin: -8640,
    paidOffsetMin: 5,
    refundedOffsetMin: -7200,
    paymentMethod: '微信支付'
  });
  seedOrder({
    userId: 'u-chenyu',
    passengerId: 'p-shenqinghe',
    trainId: 'G10',
    travelDate: addDays(today, -1),
    status: 'EXPIRED',
    createdOffsetMin: -2880
  });
  seedOrder({
    userId: 'u-chenyu',
    passengerId: 'p-chenyu',
    trainId: 'G7306',
    travelDate: addDays(today, 2),
    status: 'CANCELLED',
    createdOffsetMin: -180,
    cancelledOffsetMin: -170
  });

  return db;
}

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.trains)) return parsed;
    }
  } catch {
    // Corrupted demo data falls back to a clean seed.
  }
  const fresh = createDb();
  localStorage.setItem(DB_KEY, JSON.stringify(fresh));
  return fresh;
}

let db = readDb();

function save() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function requireUser(userId) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new ApiError('登录状态已失效，请重新登录。', 'AUTH');
  return user;
}

function requirePassenger(userId, passengerId) {
  const passenger = db.passengers.find((p) => p.id === passengerId && p.userId === userId);
  if (!passenger) throw new ApiError('乘车人不存在。', 'PASSENGER_NOT_FOUND');
  return passenger;
}

function requireOrder(userId, orderId, role = 'user') {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError('订单不存在。', 'ORDER_NOT_FOUND');
  if (role !== 'admin' && order.userId !== userId) throw new ApiError('无权访问该订单。', 'FORBIDDEN');
  return order;
}

function inventoryFor(order) {
  const train = db.trains.find((t) => t.id === order.trainId);
  if (!train) return null;
  return ensureInventoryIn(db, train, order.travelDate);
}

function sweepInternal() {
  const now = Date.now();
  let changed = false;
  for (const order of db.orders) {
    if (order.status !== 'PENDING') continue;
    if (new Date(order.lockedUntil).getTime() > now) continue;
    const inv = inventoryFor(order);
    if (inv) inv.locked = Math.max(0, inv.locked - 1);
    order.status = 'EXPIRED';
    order.expiredAt = order.lockedUntil;
    addLog(db, {
      at: order.lockedUntil,
      actorId: null,
      actorName: '系统',
      action: 'EXPIRE',
      orderId: order.id,
      fromStatus: 'PENDING',
      toStatus: 'EXPIRED',
      reason: '锁座到期未支付'
    });
    changed = true;
  }
  if (changed) save();
}

function validatePassengerData(data) {
  const name = String(data.name || '').trim();
  const idNo = String(data.idNo || '').trim().toUpperCase();
  const phone = String(data.phone || '').trim();
  if (name.length < 2 || name.length > 20) throw new ApiError('请输入 2–20 个字符的姓名。', 'VALIDATION');
  if (!validateIdNo(idNo)) throw new ApiError('证件号码格式不正确。', 'VALIDATION');
  if (!validatePhone(phone)) throw new ApiError('请输入 11 位手机号码。', 'VALIDATION');
  return { name, idNo, phone, type: '成人' };
}

function validateTrainData(data, currentId = null) {
  const no = String(data.no || '').trim().toUpperCase();
  const from = String(data.from || '');
  const to = String(data.to || '');
  const depart = String(data.depart || '');
  const arrive = String(data.arrive || '');
  const price = Number(data.price);
  const capacity = Number(data.capacity);

  if (!/^[A-Z]\d{1,4}$/.test(no)) throw new ApiError('车次号需以字母开头，例如 G1234。', 'VALIDATION');
  if (db.trains.some((t) => t.no === no && t.id !== currentId)) throw new ApiError('该车次号已存在。', 'VALIDATION');
  if (!stationByCode(from) || !stationByCode(to)) throw new ApiError('请选择有效的出发站和到达站。', 'VALIDATION');
  if (from === to) throw new ApiError('出发站和到达站不能相同。', 'VALIDATION');
  if (!/^\d{2}:\d{2}$/.test(depart) || !/^\d{2}:\d{2}$/.test(arrive)) {
    throw new ApiError('请填写有效的发车和到达时间。', 'VALIDATION');
  }
  if (trainDuration(depart, arrive) <= 0) throw new ApiError('到达时间需晚于发车时间。', 'VALIDATION');
  if (!Number.isFinite(price) || price <= 0) throw new ApiError('票价需大于 0。', 'VALIDATION');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    throw new ApiError('容量需为 1–500 的整数。', 'VALIDATION');
  }
  return { no, from, to, depart, arrive, price: round2(price), capacity };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = {
  getSession() {
    try {
      const userId = localStorage.getItem(SESSION_KEY);
      if (!userId) return null;
      return publicUser(db.users.find((u) => u.id === userId) || null);
    } catch {
      return null;
    }
  },

  async login(email, password) {
    await wait(360);
    const normalized = String(email || '').trim().toLowerCase();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === normalized && u.password === String(password || '')
    );
    if (!user) throw new ApiError('邮箱或密码不正确。', 'AUTH');
    localStorage.setItem(SESSION_KEY, user.id);
    return publicUser(user);
  },

  async register(data) {
    await wait(480);
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    if (name.length < 2 || name.length > 20) throw new ApiError('请输入 2–20 个字符的姓名。', 'VALIDATION');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('请输入有效的邮箱地址。', 'VALIDATION');
    if (password.length < 6) throw new ApiError('密码至少需要 6 个字符。', 'VALIDATION');
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      throw new ApiError('该邮箱已注册，请直接登录。', 'VALIDATION');
    }
    const user = {
      id: `u-${Date.now().toString(36)}`,
      name,
      email,
      password,
      role: 'user',
      phone: '',
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    save();
    localStorage.setItem(SESSION_KEY, user.id);
    return publicUser(user);
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  getStations() {
    return STATIONS.map((s) => ({ ...s }));
  },

  getPopularRoutes() {
    const pairs = new Map();
    for (const train of db.trains) {
      if (!train.active) continue;
      const key = `${train.from}-${train.to}`;
      const from = stationByCode(train.from);
      const to = stationByCode(train.to);
      if (!from || !to) continue;
      const current = pairs.get(key);
      if (!current) {
        pairs.set(key, {
          from,
          to,
          minPrice: train.price,
          dailyCount: 1,
          durationMin: train.durationMin,
          firstDepart: train.depart
        });
      } else {
        current.minPrice = Math.min(current.minPrice, train.price);
        current.dailyCount += 1;
        current.durationMin = Math.min(current.durationMin, train.durationMin);
        current.firstDepart = current.firstDepart < train.depart ? current.firstDepart : train.depart;
      }
    }
    return [...pairs.values()].sort((a, b) => b.dailyCount - a.dailyCount);
  },

  async parseQuery(text, options = {}) {
    await wait(600);
    const forceFail =
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).get('parsefail') === '1';
    if (forceFail) throw new ApiError('没听懂，请手动选择站点和日期', 'PARSE_FAILED');
    return parseQueryText(text, options);
  },

  async searchTrains(from, to, date) {
    await wait(420);
    sweepInternal();
    const fromStation = stationByCode(from);
    const toStation = stationByCode(to);
    if (!fromStation || !toStation) throw new ApiError('请选择有效的车站。', 'VALIDATION');
    if (from === to) throw new ApiError('出发站和到达站不能相同。', 'VALIDATION');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new ApiError('请选择有效的出发日期。', 'VALIDATION');

    const now = new Date();
    const trains = db.trains
      .filter((t) => t.from === from && t.to === to)
      .sort((a, b) => a.depart.localeCompare(b.depart));

    const results = trains.map((train) => {
      const inv = ensureInventoryIn(db, train, date);
      const departure = combineDateTime(date, train.depart);
      const departed = departure.getTime() <= now.getTime();
      const available = Math.max(0, inv.capacity - inv.sold - inv.locked);
      return {
        ...train,
        inventory: { ...inv },
        available,
        departed,
        bookable: train.active && !departed && available > 0,
        salesOpen: train.active
      };
    });
    save();
    return {
      from: fromStation,
      to: toStation,
      date,
      trains: results
    };
  },

  getTrainDetails(trainId, date) {
    sweepInternal();
    const train = db.trains.find((t) => t.id === trainId);
    if (!train) throw new ApiError('车次不存在。', 'TRAIN_NOT_FOUND');
    const inv = ensureInventoryIn(db, train, date);
    const departure = combineDateTime(date, train.depart);
    const departed = departure.getTime() <= Date.now();
    const available = Math.max(0, inv.capacity - inv.sold - inv.locked);
    return {
      ...train,
      fromName: stationByCode(train.from).name,
      toName: stationByCode(train.to).name,
      inventory: { ...inv },
      available,
      departed,
      bookable: train.active && !departed && available > 0,
      salesOpen: train.active
    };
  },

  getPassengers(userId) {
    requireUser(userId);
    return db.passengers
      .filter((p) => p.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((p) => ({ ...p }));
  },

  async addPassenger(userId, data) {
    await wait(320);
    requireUser(userId);
    const clean = validatePassengerData(data);
    if (db.passengers.some((p) => p.userId === userId && p.idNo === clean.idNo)) {
      throw new ApiError('该乘车人已存在。', 'VALIDATION');
    }
    const passenger = {
      id: `p-${Date.now().toString(36)}`,
      userId,
      ...clean,
      createdAt: new Date().toISOString()
    };
    db.passengers.push(passenger);
    save();
    return { ...passenger };
  },

  async updatePassenger(userId, passengerId, data) {
    await wait(320);
    requireUser(userId);
    const passenger = requirePassenger(userId, passengerId);
    const clean = validatePassengerData(data);
    if (db.passengers.some((p) => p.userId === userId && p.idNo === clean.idNo && p.id !== passengerId)) {
      throw new ApiError('该证件号码已被其他乘车人使用。', 'VALIDATION');
    }
    Object.assign(passenger, clean);
    save();
    return { ...passenger };
  },

  async deletePassenger(userId, passengerId) {
    await wait(260);
    requireUser(userId);
    requirePassenger(userId, passengerId);
    db.passengers = db.passengers.filter((p) => p.id !== passengerId);
    save();
  },

  getOrders(userId) {
    sweepInternal();
    requireUser(userId);
    return db.orders
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => ({ ...o }));
  },

  getOrder(userId, orderId, role = 'user') {
    sweepInternal();
    requireUser(userId);
    return { ...requireOrder(userId, orderId, role) };
  },

  async createOrder({ userId, trainId, travelDate, passengerId }) {
    await wait(520);
    sweepInternal();
    requireUser(userId);
    const passenger = requirePassenger(userId, passengerId);
    const train = db.trains.find((t) => t.id === trainId);
    if (!train) throw new ApiError('车次不存在。', 'TRAIN_NOT_FOUND');
    if (!train.active) throw new ApiError('该车次已停止售票。', 'SALES_CLOSED');
    const departure = combineDateTime(travelDate, train.depart);
    if (departure.getTime() <= Date.now()) throw new ApiError('该车次已发车，无法预订。', 'DEPARTED');

    const duplicate = db.orders.some(
      (o) =>
        o.userId === userId &&
        o.passengerId === passengerId &&
        o.trainId === trainId &&
        o.travelDate === travelDate &&
        (o.status === 'PENDING' || o.status === 'CONFIRMED')
    );
    if (duplicate) throw new ApiError('该乘车人已有此车次的有效订单。', 'DUPLICATE');

    const inv = ensureInventoryIn(db, train, travelDate);
    const available = Math.max(0, inv.capacity - inv.sold - inv.locked);
    if (available <= 0) throw new ApiError('该车次已无余票。', 'SOLD_OUT');

    const now = new Date();
    const lockedUntil = new Date(Math.min(now.getTime() + 10 * 60000, departure.getTime()));
    if (lockedUntil.getTime() <= now.getTime()) throw new ApiError('已超过本次列车的预订时间。', 'DEPARTED');

    const order = {
      id: nextOrderId(db, travelDate),
      userId,
      passengerId,
      passengerSnapshot: {
        name: passenger.name,
        idNo: passenger.idNo,
        phone: passenger.phone,
        type: passenger.type
      },
      trainId: train.id,
      trainSnapshot: {
        no: train.no,
        from: train.from,
        to: train.to,
        fromName: stationByCode(train.from).name,
        toName: stationByCode(train.to).name,
        depart: train.depart,
        arrive: train.arrive,
        durationMin: train.durationMin,
        price: train.price
      },
      travelDate,
      seatClass: '二等座',
      amount: train.price,
      status: 'PENDING',
      createdAt: now.toISOString(),
      lockedUntil: lockedUntil.toISOString(),
      paidAt: null,
      cancelledAt: null,
      expiredAt: null,
      refundedAt: null,
      refundFee: null,
      refundAmount: null,
      paymentMethod: null,
      cancelReason: null
    };

    inv.locked = Math.min(inv.capacity, inv.locked + 1);
    db.orders.push(order);
    addLog(db, {
      at: now,
      actorId: userId,
      actorName: requireUser(userId).name,
      action: 'LOCK',
      orderId: order.id,
      toStatus: 'PENDING',
      reason: '席位锁定 10 分钟'
    });
    save();
    return { ...order };
  },

  async payOrder(userId, orderId, method = '云闪付', options = {}) {
    await wait(1150);
    sweepInternal();
    const user = requireUser(userId);
    const order = requireOrder(userId, orderId);
    if (order.status !== 'PENDING') throw new ApiError('该订单当前不可支付。', 'INVALID_STATE');
    if (Date.now() >= new Date(order.lockedUntil).getTime()) {
      sweepInternal();
      throw new ApiError('订单已超时，席位已释放。', 'EXPIRED');
    }

    if (options.forceFailure) {
      addLog(db, {
        at: new Date(),
        actorId: user.id,
        actorName: user.name,
        action: 'PAY_FAIL',
        orderId: order.id,
        fromStatus: 'PENDING',
        toStatus: 'PENDING',
        reason: '支付渠道返回失败'
      });
      save();
      throw new ApiError('支付未完成，请重试或更换支付方式。', 'PAY_FAILED');
    }

    const inv = inventoryFor(order);
    if (inv) {
      inv.locked = Math.max(0, inv.locked - 1);
      inv.sold = Math.min(inv.capacity, inv.sold + 1);
    }
    order.status = 'CONFIRMED';
    order.paidAt = new Date().toISOString();
    order.paymentMethod = method;
    addLog(db, {
      at: new Date(),
      actorId: user.id,
      actorName: user.name,
      action: 'PAY',
      orderId: order.id,
      fromStatus: 'PENDING',
      toStatus: 'CONFIRMED',
      reason: `${method}支付成功`
    });
    save();
    return { ...order };
  },

  async cancelOrder(userId, orderId, reason = '行程有变') {
    await wait(480);
    sweepInternal();
    const user = requireUser(userId);
    const order = requireOrder(userId, orderId);
    if (order.status !== 'PENDING') throw new ApiError('该订单当前不可取消。', 'INVALID_STATE');
    const inv = inventoryFor(order);
    if (inv) inv.locked = Math.max(0, inv.locked - 1);
    order.status = 'CANCELLED';
    order.cancelledAt = new Date().toISOString();
    order.cancelReason = reason;
    addLog(db, {
      at: new Date(),
      actorId: user.id,
      actorName: user.name,
      action: 'CANCEL',
      orderId: order.id,
      fromStatus: 'PENDING',
      toStatus: 'CANCELLED',
      reason
    });
    save();
    return { ...order };
  },

  async refundOrder(userId, orderId, options = {}) {
    await wait(920);
    sweepInternal();
    const user = requireUser(userId);
    const order = requireOrder(userId, orderId);
    if (order.status !== 'CONFIRMED') throw new ApiError('该订单当前不可退票。', 'INVALID_STATE');
    const departure = combineDateTime(order.travelDate, order.trainSnapshot.depart);
    const deadline = new Date(departure.getTime() - 30 * 60000);
    if (Date.now() >= deadline.getTime()) throw new ApiError('已超过退票截止时间。', 'REFUND_CLOSED');

    if (options.forceFailure) {
      addLog(db, {
        at: new Date(),
        actorId: user.id,
        actorName: user.name,
        action: 'REFUND_FAIL',
        orderId: order.id,
        fromStatus: 'CONFIRMED',
        toStatus: 'CONFIRMED',
        reason: '退款渠道返回失败'
      });
      save();
      throw new ApiError('退款未完成，订单仍为已确认状态。', 'REFUND_FAILED');
    }

    const fee = round2(order.amount * 0.1);
    const refundAmount = round2(order.amount - fee);
    const inv = inventoryFor(order);
    if (inv) inv.sold = Math.max(0, inv.sold - 1);
    order.status = 'REFUNDED';
    order.refundedAt = new Date().toISOString();
    order.refundFee = fee;
    order.refundAmount = refundAmount;
    addLog(db, {
      at: new Date(),
      actorId: user.id,
      actorName: user.name,
      action: 'REFUND',
      orderId: order.id,
      fromStatus: 'CONFIRMED',
      toStatus: 'REFUNDED',
      reason: `扣除手续费 ${money(fee)}，退款 ${money(refundAmount)}`
    });
    save();
    return { ...order };
  },

  sweepExpired() {
    sweepInternal();
  },

  getAdminTrains(date = toDateStr()) {
    sweepInternal();
    const trains = db.trains
      .slice()
      .sort((a, b) => a.depart.localeCompare(b.depart))
      .map((train) => {
        const inv = ensureInventoryIn(db, train, date);
        return {
          ...train,
          fromName: stationByCode(train.from).name,
          toName: stationByCode(train.to).name,
          inventory: { ...inv },
          available: Math.max(0, inv.capacity - inv.sold - inv.locked),
          hasOrders: db.orders.some((o) => o.trainId === train.id)
        };
      });
    save();
    return trains;
  },

  async createTrain(data, adminId) {
    await wait(420);
    const admin = requireUser(adminId);
    if (admin.role !== 'admin') throw new ApiError('需要管理员权限。', 'FORBIDDEN');
    const clean = validateTrainData(data);
    const train = {
      id: clean.no,
      ...clean,
      durationMin: trainDuration(clean.depart, clean.arrive),
      active: true,
      seeded: false,
      createdAt: new Date().toISOString()
    };
    db.trains.push(train);
    addLog(db, {
      at: new Date(),
      actorId: admin.id,
      actorName: admin.name,
      action: 'TRAIN_CREATE',
      reason: `${stationByCode(train.from).name} → ${stationByCode(train.to).name}，${train.depart}–${train.arrive}`
    });
    save();
    return { ...train };
  },

  async updateTrain(trainId, data, adminId) {
    await wait(420);
    const admin = requireUser(adminId);
    if (admin.role !== 'admin') throw new ApiError('需要管理员权限。', 'FORBIDDEN');
    const train = db.trains.find((t) => t.id === trainId);
    if (!train) throw new ApiError('车次不存在。', 'TRAIN_NOT_FOUND');
    const hasOrders = db.orders.some((o) => o.trainId === train.id);
    if (hasOrders) throw new ApiError('该车次已有订单，仅可调整销售状态。', 'TRAIN_LOCKED');
    const clean = validateTrainData(data, train.id);
    const maxOccupied = Object.values(db.inventory)
      .filter((inv) => inv.trainId === train.id)
      .reduce((max, inv) => Math.max(max, inv.sold + inv.locked), 0);
    if (clean.capacity < maxOccupied) {
      throw new ApiError(`容量不能低于已售与锁定的 ${maxOccupied} 席。`, 'VALIDATION');
    }
    Object.assign(train, clean, {
      durationMin: trainDuration(clean.depart, clean.arrive)
    });
    for (const inv of Object.values(db.inventory)) {
      if (inv.trainId === train.id) inv.capacity = clean.capacity;
    }
    addLog(db, {
      at: new Date(),
      actorId: admin.id,
      actorName: admin.name,
      action: 'TRAIN_UPDATE',
      reason: `${train.no} 信息已更新`
    });
    save();
    return { ...train };
  },

  async setTrainSales(trainId, active, adminId) {
    await wait(260);
    const admin = requireUser(adminId);
    if (admin.role !== 'admin') throw new ApiError('需要管理员权限。', 'FORBIDDEN');
    const train = db.trains.find((t) => t.id === trainId);
    if (!train) throw new ApiError('车次不存在。', 'TRAIN_NOT_FOUND');
    train.active = Boolean(active);
    addLog(db, {
      at: new Date(),
      actorId: admin.id,
      actorName: admin.name,
      action: train.active ? 'SALES_ON' : 'SALES_OFF',
      reason: `${train.no} ${train.active ? '开启' : '关闭'}销售`
    });
    save();
    return { ...train };
  },

  getAdminOrders() {
    sweepInternal();
    return db.orders
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => {
        const user = db.users.find((u) => u.id === o.userId);
        return {
          ...o,
          user: user ? publicUser(user) : null
        };
      });
  },

  getLogs() {
    sweepInternal();
    return db.logs
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((log) => {
        const order = db.orders.find((o) => o.id === log.orderId);
        return {
          ...log,
          order: order
            ? {
                id: order.id,
                trainNo: order.trainSnapshot.no,
                fromName: order.trainSnapshot.fromName,
                toName: order.trainSnapshot.toName
              }
            : null
        };
      });
  },

  getOrderLogs(orderId) {
    return db.logs
      .filter((l) => l.orderId === orderId)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((l) => ({ ...l }));
  }
};

export const ACTIONS = {
  LOCK: '锁座',
  PAY: '支付',
  PAY_FAIL: '支付失败',
  CANCEL: '取消',
  EXPIRE: '超时',
  REFUND: '退票',
  REFUND_FAIL: '退款失败',
  TRAIN_CREATE: '新增车次',
  TRAIN_UPDATE: '修改车次',
  SALES_ON: '开启销售',
  SALES_OFF: '关闭销售'
};

export const STATUS_LABELS = {
  PENDING: '待支付',
  CONFIRMED: '已确认',
  CANCELLED: '已取消',
  EXPIRED: '已超时',
  REFUNDED: '已退款'
};

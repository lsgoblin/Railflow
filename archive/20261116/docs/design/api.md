# REST 接口设计

本文件把 [architecture.md](architecture.md) §2 的接入层与 [design-models.md](design-models.md) §4 的用例—组件映射固化成接口契约，供 Part III 实现与前后端联调使用。所有端点前缀 `/api`，请求与响应均为 JSON，会话用 Session + Cookie（ADR-007）。

## 1. 通用约定

- **鉴权**：访客可调用车次查询、站点字典与 AI 解析；订单、乘车人与支付类接口需登录；`/api/admin/**` 需 `role = ADMIN`（R10）。
- **错误体**：`{"error": {"code": "NO_SEATS", "message": "该车次已无余票"}}`，`code` 供前端判断，`message` 直接作为一句话文案展示。
- **状态码**：400 参数错误；401 未登录或会话过期；403 越权；404 资源不存在；409 业务冲突（无票、重复下单、状态已迁移、不满足退票条件）；422 AI 解析失败；500 未预期错误。
- **幂等**：支付、取消、超时、退款均为条件更新，重复请求因前置状态不满足返回 409，不产生第二次副作用（R6、R8）。
- **时间与金额**：一切时间以服务端为准（R4），锁座截止 `expireAt = min(下单时刻 + 10 分钟, 发车时刻)`；金额用字符串保留两位小数（R7）。
- **唯一性**：下单除服务层校验外，由订单表活跃唯一索引兜底（ADR-008），并发重复下单同样返回 409 `DUPLICATE_ACTIVE_ORDER`。
- **演示开关**：`pay` / `refund` 接受 `simulateResult: "SUCCESS" | "FAIL"`，缺省 `SUCCESS`；失败路径靠它演示，替代原型里的 Alt+点击。
- **不做分页**：演示量级小，列表接口直接返回全量。

## 2. 端点总表

| # | 方法 | 路径 | 鉴权 | 用途 | 主要错误 |
| --- | --- | --- | --- | --- | --- |
| 1 | POST | `/api/auth/register` | 公开 | 注册购票用户 | 400、409 邮箱已存在 |
| 2 | POST | `/api/auth/login` | 公开 | 登录，成功后下发会话 Cookie | 400、401 凭据错误 |
| 3 | POST | `/api/auth/logout` | 登录 | 退出并失效会话 | 401 |
| 4 | GET | `/api/auth/me` | 登录 | 当前账户与角色 | 401 |
| 5 | GET | `/api/stations` | 公开 | 站点字典（含简称/同义词，供 AI 白名单与下拉） | — |
| 6 | GET | `/api/trains?from=&to=&date=` | 公开 | 直达车次查询，不占库存（R3） | 400 参数不合法 |
| 7 | POST | `/api/ai/parse` | 公开 | 一句话解析为三槽位；5 秒超时 | 422 解析失败、超时或站名非法 |
| 8 | POST | `/api/orders` | 登录 | 下单锁座，生成 PENDING 订单 | 403 越权乘车人、409 无票/重复/停售/已发车 |
| 9 | GET | `/api/orders?status=` | 登录 | 本人订单列表（只返回本人，R10） | 401 |
| 10 | GET | `/api/orders/{id}` | 登录 | 订单详情 + 操作记录 + 退票试算 | 403 非本人、404 |
| 11 | POST | `/api/orders/{id}/pay` | 登录 | 模拟支付，PENDING → CONFIRMED | 409 已过期/已取消/重复支付 |
| 12 | POST | `/api/orders/{id}/cancel` | 登录 | 取消未支付订单，PENDING → CANCELLED | 409 非 PENDING |
| 13 | POST | `/api/orders/{id}/refund` | 登录 | 模拟退票，CONFIRMED → REFUNDED | 409 距发车≤30 分钟或非 CONFIRMED |
| 14 | GET | `/api/passengers` | 登录 | 本人乘车人列表 | 401 |
| 15 | POST | `/api/passengers` | 登录 | 新增乘车人 | 400 |
| 16 | PUT | `/api/passengers/{id}` | 登录 | 修改本人乘车人 | 403、404 |
| 17 | DELETE | `/api/passengers/{id}` | 登录 | 软删除乘车人（打 `deleted_at`）；历史订单靠快照保留，存在 PENDING/CONFIRMED 订单时拒绝 | 403、404、409 进行中订单 |
| 18 | GET | `/api/admin/trains` | 管理员 | 车次列表：容量、已售、锁定、余票、销售开关 | 403 |
| 19 | POST | `/api/admin/trains` | 管理员 | 新增车次 | 403、400 |
| 20 | PUT | `/api/admin/trains/{id}` | 管理员 | 修改车次；已有订单后仅允许改销售开关（R9） | 403、409 不可变更字段 |
| 21 | GET | `/api/admin/orders?status=` | 管理员 | 全量订单查询与筛选 | 403 |
| 22 | GET | `/api/admin/logs?orderId=` | 管理员 | 操作记录只读查询（R10） | 403 |

## 3. 关键端点示例

**一句话解析**

```http
POST /api/ai/parse
{"text": "明天下午去杭州"}
→ 200 {"fromStation": "上海虹桥", "toStation": "杭州东", "date": "2026-11-17"}

POST /api/ai/parse
{"text": "下午去杭州"}
→ 422 {"error": {"code": "AI_INCOMPLETE", "message": "没听懂，请手动选择站点和日期"}}
```

解析结果只是**预填建议**：站名必须命中 `/api/stations` 字典，缺任一槽位即 422，绝不猜测补全（[ai-features.md](ai-features.md) §2.2）。

**下单锁座**

```http
POST /api/orders
{"runId": 1024, "passengerId": 7}
→ 201 {"id": 9001, "status": "PENDING", "expireAt": "2026-11-16T15:10:00+08:00", "price": "73.00"}

→ 409 {"error": {"code": "NO_SEATS", "message": "该车次已无余票"}}
→ 409 {"error": {"code": "DUPLICATE_ACTIVE_ORDER", "message": "该乘车人在此次车次已有未完成订单"}}
```

下单的原子性是「条件 UPDATE 影响 1 行 + 订单插入」在同一事务内，影响 0 行即返回 409（ADR-003）。

**支付与退票**

```http
POST /api/orders/9001/pay
{"simulateResult": "FAIL"}
→ 200 {"result": "FAIL", "status": "PENDING", "expireAt": "2026-11-16T15:10:00+08:00"}

POST /api/orders/9001/pay
{"simulateResult": "SUCCESS"}
→ 409 {"error": {"code": "ORDER_EXPIRED", "message": "锁座已到期，订单不可支付"}}

POST /api/orders/9002/refund
{"simulateResult": "SUCCESS"}
→ 200 {"result": "SUCCESS", "status": "REFUNDED", "fee": "7.30", "refundAmount": "65.70"}

POST /api/orders/9002/refund
{"simulateResult": "FAIL"}
→ 200 {"result": "FAIL", "status": "CONFIRMED"}
```

模拟失败是预期业务结果而不是接口冲突，用 200 + `result` 表达，前端据此弹失败提示；只有状态不允许操作（已过期、已取消、重复支付）才返回 409。失败的支付不延长锁座期限（R6）；退款失败时订单保持 CONFIRMED、席位不释放（R8）。

## 4. 与需求规则的对应

| 规则 | 接口落点 |
| --- | --- |
| R1 一单一账户一乘车人一席位 | `POST /api/orders` 只接受单个 `passengerId` |
| R2 同账户同乘车人同车次不重复 | 服务层校验 + 订单活跃唯一索引兜底（ADR-008） |
| R3 查询不占库存、锁座截止取较早者 | `GET /api/trains` 只读；`expireAt` 由下单时算出 |
| R4 时间以服务端为准 | 所有时间字段由服务端生成；相对日期在 `/api/ai/parse` 内解析 |
| R5 容量不变式、最后一张票仅一人成功 | 下单事务内的单条条件 UPDATE（ADR-003） |
| R6 支付失败不延期、取消/超时只释放一次 | `pay` / `cancel` 条件更新 |
| R7 退票截止与 10% 手续费 | `refund` 校验 `now < departTime - 30min`，金额服务端算 |
| R8 退款失败保持 CONFIRMED、重复操作幂等 | `refund` 条件更新 + 409 语义 |
| R9 订单快照、车次限制变更 | 订单响应字段取自快照；乘车人删除为软删除；`PUT /api/admin/trains/{id}` 限制 |
| R10 属主与角色 | 登录态校验 + `order.accountId == session.accountId`；`/api/admin/**` 角色校验 |

## 5. 已定约束

- **乘车人删除**：软删除（`passengers.deleted_at`），存在 PENDING/CONFIRMED 订单时返回 409；历史订单只读订单内快照，不依赖乘车人行存在。
- **订单活跃唯一性**：`orders.active_flag` 生成列 + `(account_id, passenger_id, run_id, active_flag)` 唯一索引（ADR-008）；接口层把唯一冲突统一映射为 409 `DUPLICATE_ACTIVE_ORDER`。
- **接口版本化**：不引入 `/api/v1`，评审判定课程项目无跨版本需求。

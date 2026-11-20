# RailFlow 前端（MVP：同车次直达历史回放）

原生 HTML/CSS/ES Modules，无构建、无 npm、无框架、无外部 UI 依赖。本轮只做铁路历史数据回放：选择两个 GTFS 站点 → 查询同一车次直达 → 查看停站详情与所乘区间轨迹。AI、换乘、票价、保存与账号、多城市编辑、多方案比较仍然后置。

## 1. 本地运行（与 /api 同源）

前端由后端 `web` profile 直接挂载，不再单独起静态服务器：

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
& 'C:\Program Files\Java\jdk-17\bin\java.exe' -jar `
  D:\test\RailFlow\src\backend\target\railflow-backend.jar `
  --spring.profiles.active=web --server.port=8080 `
  --railflow.frontend.dir=D:/test/RailFlow/src/frontend
```

浏览器打开 <http://127.0.0.1:8080/>。页面与 `/api/mvp/**` 同源，ES Modules 必须通过 http(s) 打开，不能直接双击 `index.html`。

- `--railflow.frontend.dir` 缺省为相对工作目录的 `src/frontend`；从仓库根目录启动可省略。
- 普通 Web 启动不建表、不导入；数据库连接仍由 `output/mysql-mvp/load-env.ps1` 注入进程环境。
- 不再使用 `python -m http.server`、npm 或打包器。

## 2. 数据模式

数据模式是显式开关，不再用 `apiBase` 是否为空推断：

| 模式 | 触发 | 行为 |
| --- | --- | --- |
| live（默认） | 无 `?dev=1`，且 `config.dataMode` 未设为 `fixture` | 同源请求 `/api/mvp/**`；失败如实显示错误，**不静默回退夹具** |
| fixture | `?dev=1`（优先）或 `config.dataMode="fixture"` | 合成夹具，仅供界面检查；页面显示“开发夹具”标记与警告 |

`config.dataMode` 可选，缺省 live；`?dev=1` 始终强制 fixture，不受配置默认值影响。

`config.apiBase` 仅用于跨源部署；同源部署留空。`config.local.js` 只放高德 Key/安全密钥，已被 `.gitignore` 忽略，不要提交。

## 3. 页面流程

1. 启动先 `GET /api/mvp/context`，用 `dataset.version` 与 `defaultReferenceServiceDate` 初始化，显示“历史回放 · 参考日期/版本”短标与 `dataset.warnings`。
2. 出发/到达站：`GET /api/mvp/stations?datasetVersion&q&offset&limit`，候选同时显示站名与 `stop_id`；同名/同城多站按 `stop_id` 区分。
3. 参考服务日：`<input type="date">`，范围来自数据覆盖，默认 2026-11-16；不暗用服务器今天，不做 D0/R0 偏移。
4. 查询：`GET /api/mvp/trips?datasetVersion&fromStopId&toStopId&referenceServiceDate`，全部同车次直达按服务端顺序展示，不截断、不重排；`items=[]` 时按 `emptyReason` 区分 `NO_DIRECT_TRIP` 与 `NO_SERVICE_ON_DATE`。
5. 选择车次：`GET /api/mvp/trips/{tripId}/stops` 列全趟停站、原始时刻、完整日期与 `dayOffset`；`GET /api/mvp/trips/{tripId}/geometry` 取区间折线。
6. 换站对/换日期/换车次会立即清空旧结果；迟到响应由 store 的 `requestId`/`revision` 校验丢弃。

## 4. 地图

- 服务端全部返回 **WGS84**；只有 `map.js` 的高德适配器做一次 WGS84 → GCJ-02，离线/文字结果不转换。
- 绘制起终点、方向箭头、来源署名；`accuracy=APPROXIMATE` 与 `fromDistanceMeters`/`toDistanceMeters` 如实展示。
- `status=UNAVAILABLE` 时按 `reason` 显示原因，不补直线、不画整趟：`NO_SHAPE`、`INVALID_SHAPE`、`INVALID_STATION_COORDINATE`、`BOUNDARY_UNRESOLVED`、`BOUNDARY_AMBIGUOUS`。
- 底图加载失败：隐藏轨迹与标记，保留选站、车次和文字结果，显示“底图未加载”和重试；恢复后按当前选择重绘。离线画布不能算真实底图通过。

## 5. 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | MVP 外壳：顶栏、查询面板、地图与开发入口 |
| `app.js` | 启动与编排：context、查询、选车次、停站/几何加载、地图联动 |
| `api.js` | 数据访问层：显式 live/fixture、MVP 只读接口、错误归一化 |
| `store.js` | 单一状态与 `dispatch/subscribe`；MVP 选站/查询/停站/几何的 requestId + revision 校验 |
| `mvp-search.js` | 站点选择器：站名 + `stop_id`、输入法组合期不发请求、键盘可选 |
| `mvp-panel.js` | 车次卡片、停站表、几何状态、数据说明 |
| `map.js` | 地图适配器：`AmapAdapter` / `OfflineAdapter`、单次坐标转换、失败降级与重试 |
| `ui.js` | 共享 UI 原语：按钮、标签、toast、格式化等 |
| `tokens.css` / `app.css` | 设计令牌与页面样式 |
| `config.js` / `config.example.js` / `config.local.js` | 高德 Key 与可选数据模式；`config.local.js` 被忽略 |
| `panel.js`、`search.js`、`drafts.js`、`fixtures.js` | 后置功能（多城市、AI、草稿、旧夹具）代码保留，页面不再挂载 |

## 6. 开发与验证入口

- `?dev=1`：夹具模式（合成站点/车次/轨迹），页面显示“开发夹具”标记；不得当作真实数据证据。
- `?map=offline`：强制离线画布；`?mapfail=1`：让下一次底图加载失败，点“重试”后走真实加载，用于验证“失败隐藏轨迹 → 恢复重绘”。
- 验证深链（只读，走同一套接口与校验）：`?from=NKH&to=AOH&date=2026-11-16&trip=5l000G717920`。用于复现三个固定样例与截图。

## 7. 未覆盖与边界

- 城市归属/别名、完整 POI 消歧、换乘、票价/席别、AI、保存/账号、多方案比较不在本轮。
- 几何端点是 200 m 容差内的投影近似；`READY` 只表示源关联与区间边界匹配，不代表时刻已核验或当前开行/可售。
- 高德底图的域名白名单与配额取决于本地 Key；底图失败时按“底图未加载”处理，不用离线画布或合成轨迹代替验收。

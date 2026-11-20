# RailFlow MVP 后端

Java 17 / Spring Boot 3.3.5 / MyBatis 3.0.4 / MySQL 8.4.13。实现 [MVP 数据与接口契约（MVP-C1.2）](../../docs/design/mvp-contract.md) 的固定 GTFS 整包导入与只读查询/几何服务，对应任务 [20261118-07](../../tasks/20261118-tasks.md#20261118-07) 与 [20261118-08](../../tasks/20261118-tasks.md#20261118-08)。

本轮范围只有：整包导入（版本化、校验后激活）、站点检索、同车次直达查询、停站详情、区间几何、导入记录。不含账号、保存、AI、换乘、票价、订单或管理后台。

## 1. 目录

```text
src/backend/
├── pom.xml                        # artifact 固定为 target/railflow-backend.jar
└── src/main/
    ├── java/com/railflow/
    │   ├── RailFlowApplication.java
    │   ├── common/                # 统一错误体与错误码（契约 §8）
    │   ├── importer/              # CSV 解析、固定包校验、导入、命名锁、CLI 错误码
    │   ├── cli/                   # schema / import 两个一次性命令
    │   ├── geometry/              # 顺序投影与区间裁剪算法（契约 §7）
    │   └── web/                   # 只读 API、DTO、MyBatis mapper、参数校验
    └── resources/
        ├── application.yml / application-{schema,import,web}.yml
        ├── db/migration/V1__mvp_schema.sql   # 迁移 1，14 张表
        └── logback-spring.xml                 # 日志走 stderr，stdout 只留 JSON 摘要
```

## 2. 前置环境

| 项 | 要求 | 本机实测 |
| --- | --- | --- |
| JDK | 17 | `C:\Program Files\Java\jdk-17`（17.0.10）；PATH 默认是 21，**必须显式设置 `JAVA_HOME`** |
| Maven | 3.9+ | `output/tools/apache-maven-3.9.9`（不在 PATH；本地仓库 `output/.m2/repository`） |
| MySQL | 8.x，仅本地专用实例 | 127.0.0.1:3307，库 `railflow_mvp_dev` / `railflow_mvp_test`，账号仅两库权限 |
| 固定包 | `gtfs-20261116-085531` | `output/gtfs-20261116-085531.zip`，73,465,159 B，SHA-256 `4D60E725…9666D` |

连接值只经私有加载器注入**当前 PowerShell 进程**，不写入代码、台账、交接或日志：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. 'D:\test\RailFlow\output\mysql-mvp\load-env.ps1' -Database dev    # 测试库用 -Database test
```

`DB_URL`/`DB_USERNAME`/`DB_PASSWORD`（以及 `DB_TEST_URL`）由加载器导出；每个新 shell 都要重新加载。需要 mysql CLI 时把密码放进临时进程环境 `MYSQL_PWD` 并在 `finally` 移除，不放命令行参数。

## 3. 构建

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
$mvn='D:\test\RailFlow\output\tools\apache-maven-3.9.9\bin\mvn.cmd'
& $mvn -o -Dmaven.repo.local=D:/test/RailFlow/output/.m2/repository `
       -f D:/test/RailFlow/src/backend/pom.xml package
# 产物：src/backend/target/railflow-backend.jar（约 25.5 MB）
& $mvn ... test      # 44 项单元测试：几何 9、累计时刻 4、CSV/字段 8、schema 结构校验 15、已知源异常 8
```

离线构建依赖 `output/.m2/repository` 中已有依赖；`mvn clean` 需要的插件未缓存，删产物请直接删 `target/` 下文件。

## 4. 运行（三个 profile）

普通 Web 启动不会自动建表、下载或导入。`schema` 与 `import` 必须先取得命名锁，且所有写入、校验、清理和激活都在**同一物理 JDBC 连接**上完成。

```powershell
$java='C:\Program Files\Java\jdk-17\bin\java.exe'; $jar='D:\test\RailFlow\src\backend\target\railflow-backend.jar'

# 1) 迁移 1（幂等，不覆盖未知结构，保留既有 active 指针）
& $java -jar $jar --spring.profiles.active=schema --spring.main.web-application-type=none

# 2) 固定包整包导入（一次性；参数不可绕过固定 release 与哈希）
& $java -jar $jar --spring.profiles.active=import --spring.main.web-application-type=none `
  --railflow.import.file=D:\test\RailFlow\output\gtfs-20261116-085531.zip `
  --railflow.import.version=gtfs-20261116-085531 `
  --railflow.import.expected-sha256=4D60E72512C4595B516A5E13BE41235C87620A1C39D38FD2310E1094A5D9666D

# 3) 只读 API + 同源前端（默认 8080，可用 SERVER_PORT 覆盖）
& $java -jar $jar --spring.profiles.active=web
# 前端目录缺省为工作目录下的 src/frontend；从其他目录启动时显式指定：
#   --railflow.frontend.dir=D:/test/RailFlow/src/frontend
```

`web` profile 把 `src/frontend` 挂到同源静态路径（`/` 转发到 `index.html`），页面与 `/api/mvp/**` 同源，保持 ES Modules 无构建。`schema`/`import` 仍为非 Web 进程，不挂载静态文件。

stdout 只有一行 JSON 摘要，日志在 stderr。退出码：`0` 成功/NOOP，`2` 输入或包校验失败，`3` 锁冲突，`4` 数据库/结构失败，`5` 其他运行失败。错误码另有 `PACKAGE_HASH_MISMATCH`、`PACKAGE_CONTENT_INVALID`、`DATASET_HASH_CONFLICT`、`SCHEMA_NOT_READY`、`IMPORT_IN_PROGRESS`、`IMPORT_INTERRUPTED`、`DATABASE_UNAVAILABLE`。

导入行为：

- 先核对固定 release 名与 ZIP SHA-256，再核对九个文件的表头、固定数据行数与解压字节哈希；任一不符即失败，不写库。
- 已存在同版本同哈希且 ACTIVE → `NOOP`，不重复写数据。
- 同名版本不同哈希 → `DATASET_HASH_CONFLICT`，不覆盖。
- 新版本按 `dataset_version_id` 分批写入（每批 1,000 行，每 20 批提交），全部校验通过后在短事务内锁定 `dataset_active` 单例行并原子切换指针、置 ACTIVE。
- 失败或中断只影响未激活版本；下次导入会先把遗留 `IMPORTING`/`VALIDATING` 流水登记 `INTERRUPTED`、清理其非 active 数据再重试。无 active 版本时接口返回 503 `DATASET_NOT_READY`。
- 连接仍可用时的普通 SQL 失败会写为 `FAILED` 并记录 `finished_at`/`error_code`（不再留假“导入中”）；真正断连只终止本次 attempt，不换连接续写。
- **已知源时刻异常门禁（MVP-C1.2 §3.1，任务 15 选 A）**：固定包有 193 条 `arrival_seconds > departure_seconds` 的源记录（192 个车次），原值不改，但只在**完整集合与版本化清单精确匹配**时允许激活——身份 `(tripId, stopSequence, stopId)` 加两项原始时刻字符串逐条比对；少一条、多一条、重复、改键或改原值、清单 SHA-256 不符，一律 `PACKAGE_CONTENT_INVALID` 且不激活、保留旧 active。清单为 classpath 资源 `gtfs/gtfs-20261116-085531-time-anomalies.json`（SHA-256 `2D0EF97E…2BC2B4`，与 `docs/design/fixtures/` 同字节）。三个固定样例均不在该清单内。
- **完成流水的可追溯报告**：SUCCEEDED 与 NOOP 的 stdout JSON 与 `dataset_import_run.report_json` 都带 `validationPolicy:"MVP-C1.2"`、`sourceAnomalyManifestSha256`、非空 `warnings`（至少含“193 条/192 个车次、原值未修正”摘要）；`report_json` 另存 `knownSourceAnomalies` 完整 193 条（按 tripId 二进制序/stopSequence）。
- **NOOP 审计**：同包重复导入不再直接返回空警告 NOOP，而是先分别核对固定 ZIP 与当前 active 库的异常集合，再追加一条携带新政策、清单与警告的 NOOP 流水；active 指针与业务行数不变，旧流水不覆写。

`schema` 的结构校验：`CREATE TABLE IF NOT EXISTS` 会静默保留结构不同的既有表，因此迁移 1 只有在 **14 张表及必需列全部匹配** 时才登记 `schema_version`：InnoDB 引擎、列类型/长度/可空性、标识列 `utf8mb4_bin` 排序规则、所有字符列的 `utf8mb4` 字符集、主键、必需索引/唯一键，以及状态 CHECK 约束的**表达式**（同名但允许值集合不同也拒绝，比较前归一化字符集前缀、转义引号、反引号、大小写与空白）。否则输出 `SCHEMA_NOT_READY` 并列出缺失/不兼容项，不登记迁移成功、不覆盖未知表（见 §10）。

## 5. 只读 API

前缀 `/api/mvp`，无登录；响应 `application/json;charset=UTF-8`；失败统一 `{"error":{"code":"…","message":"…"}}`。所有 ID 区分大小写，参数需 URL 编码。

| 方法/路径 | 参数 | 说明 |
| --- | --- | --- |
| `GET /context` | — | 数据集信息、默认参考日 `2026-11-16`、能力标记、历史回放短标 |
| `GET /stations` | `datasetVersion`、`q`(1–64)、`offset`(≥0)、`limit`(1–100，默认 50) | 站名或 `stop_id` 字面包含；按 `stop_id` 升序；未命中为 200 空列表 |
| `GET /trips` | `datasetVersion`、`fromStopId`、`toStopId`、`referenceServiceDate` | 同车次直达；按发车秒、`trip_id`、上下车站序稳定排序，全量不截断 |
| `GET /trips/{tripId}/stops` | `datasetVersion`、`referenceServiceDate` | 全趟停站、原始时刻与完整日期时间；当日未开行 409 |
| `GET /trips/{tripId}/geometry` | `datasetVersion`、`referenceServiceDate`、`fromStopId`、`toStopId`、`boardSequence`、`alightSequence` | 所乘区间折线；不可用时 200 + `status=UNAVAILABLE` |
| `GET /datasets/{datasetVersion}/imports` | `offset`、`limit`(1–100，默认 50) | 当前 active 版本的脱敏导入流水 |

错误：422 `VALIDATION_FAILED`/`SAME_STATION`/`DATE_OUTSIDE_COVERAGE`/`SEGMENT_ORDER_INVALID`；404 `DATASET_NOT_FOUND`/`STATION_NOT_FOUND`/`TRIP_NOT_FOUND`；409 `DATASET_NOT_ACTIVE`/`SERVICE_NOT_RUNNING`；503 `DATASET_NOT_READY`/`DATABASE_UNAVAILABLE`；500 `INTERNAL_ERROR`。`/trips` 无结果时 200 且 `emptyReason` 为 `NO_DIRECT_TRIP`（无顺序正确的站对）或 `NO_SERVICE_ON_DATE`（有站对但参考日不开行）。

MVP-C1.2 起 `Dataset` 与 `ImportRun` 各带必有 `warnings:string[]`：`/context.dataset.warnings` 对该固定版本始终给出已知源异常摘要；`/datasets/{v}/imports` 的 `items[].warnings` 取各自 `report_json` 中的警告，历史/无警告流水返回 `[]`——空数组**不能**推断时刻正确。逐车次/停站/几何 DTO 字段与排序不变。

### 示例

```powershell
$v='gtfs-20261116-085531'; $d='2026-11-16'; $b='http://127.0.0.1:8080/api/mvp'
Invoke-RestMethod "$b/context"
Invoke-RestMethod "$b/stations?datasetVersion=$v&q=%E5%8D%97%E4%BA%AC%E5%8D%97"   # 南京南
Invoke-RestMethod "$b/trips?datasetVersion=$v&fromStopId=NKH&toStopId=AOH&referenceServiceDate=$d"
Invoke-RestMethod "$b/trips/240000T2971H/stops?datasetVersion=$v&referenceServiceDate=$d"
Invoke-RestMethod "$b/trips/240000G53106/geometry?datasetVersion=$v&referenceServiceDate=$d&fromStopId=VNP&toStopId=NKH&boardSequence=1&alightSequence=10"
```

关键响应片段（实测）：

```json
{"stopId":"NKH","stopName":"南京南","longitude":118.7930520,"latitude":31.9707970,"coordinateSystem":"WGS84","locationType":0}
{"tripId":"240000T2971H","trainName":"T297","shapeId":"shape-287","boardSequence":1,"alightSequence":8,
 "to":{"stopId":"HBB","stopName":"哈尔滨","arrivalTime":"26:06:00","arrivalSeconds":93960,
       "arrivalDateTime":"2026-11-17T02:06:00+08:00","arrivalDayOffset":1}}
{"status":"READY","coordinateSystem":"WGS84","accuracy":"APPROXIMATE","method":"ORDERED_PROJECTION_200M_V1",
 "fromDistanceMeters":140.489,"toDistanceMeters":42.728,"points":[[116.3733862,39.862472], "..."]}
```

## 6. 坐标系与几何

- 数据库、服务端匹配和 HTTP 全部使用 **WGS84**（`coordinateSystem:"WGS84"`，`shapes`/`stops` 原始坐标，精度 1e-7）。
- WGS84 → GCJ-02 的转换**只在前端高德适配器做一次**（契约 §1）。后端不做坐标转换，前端若收到 WGS84 不能再按“已转换”处理，也不能重复转换。
- 几何按契约 §7：读同版本 `shape_id` 有序点 → 去相邻重复点 → 球面累计 `s` → 站点投影到每条线段取局部极小候选（200 m 阈值，同一 `s` 去重）→ 全趟站序前向/后向可达性筛可行链 → 两端候选唯一且 `sFrom < sTo` 才 `READY`，否则 `UNAVAILABLE` 并给出 `reason`（`NO_SHAPE`/`INVALID_SHAPE`/`INVALID_STATION_COORDINATE`/`BOUNDARY_UNRESOLVED`/`BOUNDARY_AMBIGUOUS`）。不按停站下标切点、不补直线、不画到后续终点。
- 端点为投影近似位置（`accuracy:"APPROXIMATE"`，站点到折线 1–141 m）；真实铁路走向仍需在真实底图逐段核对。

## 7. 实测结果（2026-11-18，作者自测）

| 项目 | 结果 |
| --- | --- |
| 迁移 1 | 14 张表；重复执行幂等，active 指针保留 |
| 首次整包导入 | `SUCCEEDED`，75.0 s（wall 78.7 s），九文件合计 **4,778,140** 行（1+23,041+1+11,806+4,612,246+109,793+3,180+6,266+11,806）全部吻合，版本激活 |
| 存储规模 | InnoDB 344.4 MB（`shapes` data 318.8 MB、`stop_times` 22.6 MB + 索引 7.9 MB；information_schema 估算，统计时间 2026-11-18T06:06:53Z） |
| 同包重复导入 | `NOOP` ×3，行数不变，0.37–0.44 s |
| 损坏包 | exit 2 `PACKAGE_HASH_MISMATCH`；test 库 active 基线下指针/行数不变 |
| 命名锁冲突 | exit 3 `IMPORT_IN_PROGRESS` |
| 强杀中断（test 库） | 版本/流水 IMPORTING、active 为空、shapes 部分 1,040,000 行；接口 503/409；重试登记 `INTERRUPTED` 后成功激活 |
| 同名异哈希 | exit 5 `DATASET_HASH_CONFLICT` |
| 三样例 | G7179 224 点 61.143/112.702 m；G531 700 点 140.489/42.728 m（止于南京南）；T297 1248 点 17.470/1.002 m（止于哈尔滨，26:06:00→次日 02:06） |
| 已知源异常门禁（C1.2） | 首次导入：DB 异常集合 193 条/192 车次与清单一致后激活；SUCCEEDED 报告含 `validationPolicy=MVP-C1.2`、清单哈希、193 条清单与 2 条警告 |
| NOOP 审计（C1.2） | dev 同包重导：run 8 为 NOOP、policy/清单/193 条/1 条警告齐全，指针=1、`shapes` 4,612,246、旧流水未覆写；历史 NOOP 流水 `warnings=[]` |
| 两处 HTTP 警告 | `/context.dataset.warnings` 与 `/imports.items[].warnings` 均可见；旧流水返回 `[]` |
| 单元测试 | 44 项通过（几何 9、累计时刻 4、CSV/字段 8、schema 结构校验 15、已知源异常 8） |

## 8. 已知源数据异常（MVP-C1.2 已裁决：原值保留 + 限定激活 + 公开警告）

固定包 `stop_times.txt` 有 **193 条**记录到达时刻晚于发车时刻（192 个车次；源数据把到达多加 24 h，例如 `02000K706610` 第 9 站到达 `47:53:00`、发车 `24:15:00`；也有仅逆序 6 分钟的 `95000T957200` seq7 `31:11:00/31:05:00`）。任务 15 由用户拍板采用 **A**：不归一化、不改写源值、不删车次/停站，只在完整集合匹配版本化清单时允许激活并公开警告（契约 [MVP-C1.2 §3.1](../../docs/design/mvp-contract.md)）。

- 清单：`docs/design/fixtures/gtfs-20261116-085531-time-anomalies.json`（193 条/192 车次，SHA-256 `2D0EF97E…2BC2B4`），同字节打包为 classpath 资源；逐条核对身份与两项原始时刻，缺失/增加/重复/改动/哈希不符均拒绝激活。
- 报告：SUCCEEDED 与 NOOP 的 stdout 与 `report_json` 带 `validationPolicy`、清单哈希与非空 warnings；`report_json` 另存完整 193 条。
- 公开：`Dataset.warnings` 与 `ImportRun.warnings`；`/context` 与 `/imports` 可见。警告只表示“源时刻含已知异常”，不表示时刻可衔接或当前可售；几何 `READY` 仅表示源关联与区间边界匹配，不证明时刻正确。
- 三个固定样例（G7179/G531/T297）均不在清单内，预期不变。11/19 界面在版本/来源区域就近显示提示，逐车次展示原始参考值。

## 9. 未覆盖与接入注意

- 几何端点为 200 m 容差内的投影近似，`READY` 只表示源关联与区间边界匹配；真实铁路走向仍以真实底图逐段核对为准，不能把 `READY` 当作时刻正确或当前开行。
- 11/19 已接前端与真实高德底图：`web` profile 同源挂载 `src/frontend`；`api.js` 默认 live、失败不静默回退夹具；`app.js` 启动读 `/context`；`map.js` 仍只做一次 WGS84→GCJ-02，底图失败时隐藏轨迹并保留文字结果。
- 未做并发查询压力测试；命名锁只覆盖导入互斥。本轮无账号/属主逻辑，后续用户接口须另加 Session 与属主校验。
- 凭据仅在本机私有目录；`output/`（含固定包、日志、探针脚本）与 `target/` 均被 Git 忽略，不进交付。

## 10. 变更记录（16 号独立审核后修复，任务 17–21、C1.2、24、27、08、11/19 同源挂载）

| 任务 | 修复 | 验证 |
| --- | --- | --- |
| 17 | `schema` 迁移后校验 14 张表的结构（`SchemaGuard`）：InnoDB 引擎、必需列的类型/长度/可空性/标识排序规则、主键列序、必需索引/唯一键、状态 CHECK 约束；不匹配则 `SCHEMA_NOT_READY`、不登记 `schema_version`、不覆盖未知表（允许兼容的额外列） | 单测（现与 25/27/08 合并为 15 项）；test 库「仅 unknown_column」与「同名列但 INT/MyISAM/无主键」两个反例均实测拒绝，恢复后幂等成功 |
| 18 | 连接仍可用时的普通 SQL 失败写入 `FAILED`（含 `finished_at`/`error_code`），不再留假“导入中”；真断连只终止 attempt | test 库受控 SQL 故障注入：run/version 均为 FAILED，active 不变；恢复后重导成功 |
| 19 | 站点/车次/停站/几何/导入记录的格式参数先校验，再解析版本与访问数据库；同站判断属业务条件，置于版本、覆盖日期与站点身份之后 | 未知版本+缺参/坏日期 422；未知版本+同站 404；超覆盖+同站 422 `DATE_OUTSIDE_COVERAGE`；未知站点+同站 404；有效输入同站 422 `SAME_STATION` |
| 20 | `/imports` 默认 `limit` 由 20 改为 50，与 `/stations` 一致 | 缺省、1、100、101 边界实测 |
| 21 | 九文件合计行数更正为 **4,778,140**（原 4,874,335 为文字加总错误，非漏导入）；并更正“warnings 在 `/imports` 可见”的错误说法 | 逐文件求和复算 |
| C1.2 | 新增 `KnownSourceAnomalies`：classpath 清单（193 条/192 车次，哈希固定）+ 精确集合门禁；SUCCEEDED/NOOP 报告带 `validationPolicy`/清单哈希/完整清单/非空 warnings；NOOP 改为先审计固定 ZIP 与 active 库再追加流水；`Dataset`/`ImportRun` 新增 `warnings` | 单测 8 项；dev NOOP 审计与 test 首次导入实测；两处 HTTP 警告可见 |
| 24 | `docs/design/fixtures/verify-frontend-fixtures.ps1` 在 PowerShell 7 下 `ConvertFrom-Json` 会把 ISO 时间转成 DateTime 丢失偏移；改为在支持时使用 `-DateKind String`，`Read-Date` 防御性保留 UTC 偏移，断言未放宽 | 5.1 复跑 PASS（`Runtime: PowerShell 5.1.26100.9818; JSON dates: runtime-default.`）；本机未安装 PowerShell 7，PS7 复跑待有该运行时的环境验证 |
| 27 | 收敛两项“同名但不兼容”残留：① 状态 CHECK 不只比对约束名，改读 `information_schema.check_constraints.check_clause`，归一化字符集前缀/转义引号/反引号/大小写/空白后比较 `IN` 允许值集合（集合相等，顺序无关），非 `IN` 表达式按归一化文本比较；② 所有字符列校验 `character_set_name`（标识列另要求 `utf8mb4_bin`，`sha256` 为 `ascii`），不再只查标识列排序规则；同时同步运行说明的单测数（33→43） | 单测 14 项（新增同名窄集合、缺一个允许值、非 `IN` 表达式不符、非标识列 latin1、字符集归一化）；test 库隔离 `fix27_` 前缀表实测：正常结构 `SCHEMA_READY`/exit 0，窄集合与 `stop_name` latin1 均 `SCHEMA_NOT_READY`/exit 4 且 `schema_version` 0 行；dev/test 真实库 `SCHEMA_READY`、active 指针 1/5 不变 |
| 08 | CHECK `IN` 字面值改为大小写敏感比较：`checkClauseSatisfies` 不再把允许值/实际值 `toLowerCase`；`inListValues` 用归一化形式判断结构、从原始 `check_clause` 提取字面值并保留大小写；仅归一化关键字/空白/引号/字符集前缀/外层括号 | 新增 `lowercaseCheckValuesAreRejected`；`mvn -o test` 44/44；test 库隔离 `fix27_` 全小写允许值 exit 4 `SCHEMA_NOT_READY`、0 行，原窄集合/latin1/正常结构不回归 |
| 11/19-01/02 | `web` profile 同源挂载 `src/frontend`（`WebStaticConfig`，`/` 转发 `index.html`，默认 `src/frontend`，可用 `--railflow.frontend.dir` 覆盖）；普通 Web 启动仍不建表/不导入 | `/`、`/index.html`、`/app.js` 200 且 `text/javascript`；页面与 `/api/mvp/**` 同源；schema/import 不挂载静态文件 |

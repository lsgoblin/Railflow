# MVP 数据与接口契约

- 契约版本：MVP-C1.2 / 2026-11-18 / Asia/Shanghai；接续 C1.1，按用户授权的任务15裁决新增固定源时刻异常的限定例外与公开警告。C1/C1.1 的审核和实现打回记录保留，不能视为本版已通过。
- 负责角色：决策；关联 [20261118-05](../../tasks/20261118-tasks.md#20261118-05)，交 [06](../../tasks/20261118-tasks.md#20261118-06) 独立审核。审核结论及状态只记任务和审核交接。
- 授权：用户要求完成开工三项前置，并明确确认下述查询/排序/可选参考日方案，以及仓库内独立 MySQL 3307 实例及专用开发/测试库。
- 范围：[功能清单的 16 项 MVP 要求](feature-list.md#mvp)。07/08 实现数据与服务，11/19 接入界面和真实底图；本契约不引入账号、保存、AI、换乘、票价或订单。
- 证据基线：[开发只读核查](../../handoff/20261118-07-08-backend-blocked.md)。本文字段已再次对固定压缩包的九个 CSV 表头核对；不将包内核查称为导入/接口验收。

## 1. 已确认的产品与技术决定

| 事项 | 本轮决定 |
| --- | --- |
| OPEN-12 | 搜索并选定起/终 GTFS 站点 → 查询直达车次 → 选择车次 → 查看停站/所乘区间及轨迹。候选显示站名和 stop_id，不依赖城市映射。 |
| OPEN-13 | 列出参考日全部同车次直达区间，不做数量截断或车次列表分页。按起站 departureSeconds 升序，再按 trip_id 二进制字典序、boardSequence、alightSequence 升序稳定排序；不引入完整产品的同换乘次数排序规则。 |
| OPEN-16 | 用户可选包内参考服务日，界面默认 2026-11-16；API 显式传 referenceServiceDate，不暗用服务器今天。日期表示列车原始服务日，途中上车/下车可能已是下一自然日。无 D0/R0 偏移。 |
| 坐标责任 | 数据库、服务端匹配与 HTTP 全部使用 WGS84。仅前端高德地图适配器将站点和轨迹 WGS84 → GCJ-02 一次；离线/文字结果不转换。返回坐标系字段，不接受按数值猜坐标系。 |
| OPEN-08 | 本轮沿用已有高德 JS API 2.0 适配方向；本地 Key 沿既有忽略配置取得，凭据不进契约。Key/域名的真实底图加载仍由 11/19 实测，不能用本次后端审核声称通过。 |
| 导入入口 | 仅本地专用 profile 的一次性命令；不提供导入 HTTP，不增加管理员或登录功能。普通 Web 启动不自动 DDL、下载或导入。 |
| OPEN-14 | 固定批量读写实现，记录实测耗时、各表行数与 InnoDB 存储；07 按实测回填，不先承诺性能值。 |
| 任务15（选A） | 仅当前固定 ZIP 中清单完整匹配的193条到达晚于发车记录，允许原值入库、记录可追溯警告后激活；不归一化、不删车次/停站、不对其他异常泛化放行。具体门禁、报告和公开警告见§3.1。 |

UI 统一短标为“历史回放 · 参考日期/版本”；不得表述为当前实际开行或可售。三样例参考日使用 2026-11-16；其他日历测试显式传相应日期，不改系统时钟。

## 2. 固定输入与整包完整性

- 固定 release：`gtfs-20261116-085531`；feed_version：`20261116`。
- 来源：<https://github.com/wensimehrp/chinese-railway-gtfs/releases/download/gtfs-20261116-085531/output_gtfs.zip>。
- 压缩包 SHA-256：`4D60E72512C4595B516A5E13BE41235C87620A1C39D38FD2310E1094A5D9666D`，73,465,159 bytes。导入入口同时核对固定 release 和此哈希，不能用任意参数绕过。
- feed 范围：2026-11-01 至 2027-02-02，含两端；逐车依 calendar_dates 校验，不默认全范围每天开行。
- 包内没有 calendar.txt、shape_dist_traveled、票价；不补造。保留作者 wensimehrp (Jeremy Gao)、来源、CC BY 4.0 及坐标/裁剪变更说明。

| 文件 → 表 | 固定包数据行数，不含表头 |
| --- | --- |
| agency.txt → gtfs_agency | 1 |
| calendar_dates.txt → gtfs_calendar_date | 23,041 |
| feed_info.txt → gtfs_feed_info | 1 |
| routes.txt → gtfs_route | 11,806 |
| shapes.txt → gtfs_shape_point | 4,612,246 |
| stop_times.txt → gtfs_stop_time | 109,793 |
| stops.txt → gtfs_stop | 3,180 |
| translations.txt → gtfs_translation | 6,266 |
| trips.txt → gtfs_trip | 11,806 |

九文件的全部字段按 §3 保存；不能只存 ZIP、跳过 translations/agency/feed_info 或只导入样例。CSV 按 UTF-8 和标准引号/转义解析，支持引号中的逗号、双引号、换行，行数指 CSV 记录数。每文件另记录解压后原始字节 SHA-256、header、记录数，核对表头、字节哈希与固定包清单。正常导入重复业务键或引用缺失报失败，不 INSERT IGNORE 丢行。shape_id 为空或引用的 shape 不存在是允许的几何缺失，记录警告，不当作 stop/route/service 引用校验失败。

## 3. MySQL 表与索引

所有表 InnoDB / utf8mb4；标识使用 VARCHAR(128) COLLATE utf8mb4_bin，保留大小写和原值。下表 `D`=dataset_id BIGINT，所有业务 PK 前缀均为 D。状态使用有校验的字符串或等价枚举。时间戳存 UTC DATETIME(3)，HTTP 输出带 Z；车次发到时刻另按 Asia/Shanghai 求值。保留原始经纬度，DECIMAL(10,7)，不存转换后的 GCJ-02。

| 表 | 字段（除 D 外） | 键与索引 |
| --- | --- | --- |
| schema_version | version INT、applied_at DATETIME(3) | PK(version)，本轮迁移 1 |
| dataset_version | id BIGINT AUTO_INCREMENT、version_name VARCHAR(64)、sha256 CHAR(64) ascii_bin、source_url TEXT、feed_version VARCHAR(32)、coverage_start/end DATE、status VARCHAR(16)、created_at/activated_at DATETIME(3)，activated_at 可空 | PK(id)；UNIQUE(version_name)；status 为 IMPORTING/VALIDATING/ACTIVE/FAILED；同名不同哈希冲突 |
| dataset_active | singleton_id TINYINT=1、dataset_id BIGINT 可空 | PK(singleton_id)；单行指针；应用保证只允许 1 |
| dataset_import_run | id BIGINT AUTO_INCREMENT、dataset_id 可空、requested_version VARCHAR(64)、status VARCHAR(16)、started_at DATETIME(3)、finished_at DATETIME(3) 可空、elapsed_ms BIGINT 可空、error_code VARCHAR(64) 可空、report_json JSON | PK(id)；INDEX(dataset_id,id)；状态 CHECKING/IMPORTING/VALIDATING/SUCCEEDED/NOOP/FAILED/INTERRUPTED |
| dataset_file | file_name VARCHAR(64)、sha256 CHAR(64) ascii_bin、header TEXT、source_rows BIGINT、imported_rows BIGINT、uncompressed_bytes BIGINT | PK(D,file_name)，共九行 |
| gtfs_agency | agency_id、agency_name VARCHAR(255)、agency_url TEXT、agency_timezone VARCHAR(64) | PK(D,agency_id) |
| gtfs_feed_info | row_no INT、feed_publisher_name VARCHAR(255)、feed_publisher_url TEXT、feed_lang VARCHAR(32)、feed_start_date/end_date DATE、feed_version VARCHAR(32) | PK(D,row_no)；保留源记录顺序 |
| gtfs_stop | stop_id、stop_name VARCHAR(255)、stop_lat/lon DECIMAL(10,7)、location_type INT | PK(D,stop_id)；INDEX(D,stop_name,stop_id)，站名不唯一 |
| gtfs_route | route_id、agency_id、route_short_name VARCHAR(255)、route_type INT | PK(D,route_id)；INDEX(D,agency_id) |
| gtfs_trip | trip_id、route_id、service_id、trip_short_name VARCHAR(255)、trip_headsign VARCHAR(255)、shape_id 可空 | PK(D,trip_id)；INDEX(D,service_id,trip_id)；INDEX(D,shape_id) |
| gtfs_stop_time | trip_id、stop_sequence INT、stop_id、arrival_time/departure_time VARCHAR(16)、arrival_seconds/departure_seconds INT UNSIGNED | PK(D,trip_id,stop_sequence)；INDEX(D,stop_id,trip_id,stop_sequence) |
| gtfs_calendar_date | service_id、service_date DATE、exception_type TINYINT | PK(D,service_id,service_date)；INDEX(D,service_date,exception_type,service_id) |
| gtfs_shape_point | shape_id、shape_pt_sequence INT、shape_pt_lat/lon DECIMAL(10,7) | PK(D,shape_id,shape_pt_sequence)，按该顺序读取 |
| gtfs_translation | row_no INT、table_name VARCHAR(128)、field_name VARCHAR(128)、language VARCHAR(32)、translation TEXT、record_id VARCHAR(128) | PK(D,row_no)；原始九文件字段均保存，不构造新的车站实体 |

原始固定包中必填字段不得静默填空；空 shape_id 归一为 NULL。stop/trip/route 等 ID 与 service_id 的逻辑引用在激活前校验；本轮采用应用校验而不依赖跨大表级联删除。外键若实现，不能给允许缺失的 shape 关联加必存在约束。calendar_dates exception_type=1 增加、2 排除；本固定包全为 1，但查询不把缺记录当开行。坐标非有限数/越界、序列重复、非法日期/时刻、同 trip 站序时间倒退仍拒绝激活；同站发车早于到达仅适用§3.1的逐条限定例外，其余仍拒绝。无 shape 单独警告；站点名称重复不是失败。

源时刻用非负累计秒表达，分钟/秒必须 0–59；不能经 LocalTime 截为一天。`referenceServiceDate` 当地零点 + 累计秒得到完整发到时间，输出 ISO 8601 `+08:00`；dayOffset=floor(seconds/86400)。

### 3.1 任务15裁决：已知源异常保真与限定激活

用户明确要求总决策在A/B/C中拍板，采用 **A（保留源值+已知异常警告）**。理由：本轮验证真实数据和区间轨迹，没有足以修复原始时刻的权威依据；异常并非统一“多加24h”，例如 `95000T957200` seq7 的 `31:11:00/31:05:00` 仅相差6分钟。不能统一减24h、调换到发、补日期或修改系统时间。

- 唯一例外清单：[gtfs-20261116-085531-time-anomalies.json](fixtures/gtfs-20261116-085531-time-anomalies.json)，193条、192个trip；清单文件 SHA-256 `2D0EF97E3D0AD3F627097728F61AC18E27EA405BB84362052FC8E817E00BC2B4`。源 stop_times 解压字节 SHA-256 `B532C301E6C0CC7762BC5ECFAC33BD0D0458E3140FCF58D92464218E78CCEE5B`；ZIP 仍必须匹配§2固定哈希。
- 使用清单前核对其实际字节哈希、版本/源哈希/count及records身份唯一性，损坏/不匹配报PACKAGE_CONTENT_INVALID；只接受本版193条资源，不提供跳过校验/通用放行开关。
- 入库前/激活前比对异常集合：身份为 `(tripId,stopSequence,stopId)`，同时精确核对 `arrivalTime,departureTime` 原始字符串；集合必须恰好等于清单。仅数量=193不够。缺失、增加、身份/原时刻被改、重复记录、其他版本/哈希均不是本例外，报 PACKAGE_CONTENT_INVALID 或既有哈希冲突错误，不激活，保留旧active。
- `arrivalTime/arrivalSeconds/departureTime/departureSeconds` 原样保存与按既有规则解析，所有其他文件/字段/引用/日期/坐标/站序和几何校验不变。193条仍计入 stop_times 的109,793条，不另插入或删除源记录。不得在后端过滤对应192个trip或改列表排序。
- SUCCEEDED 与 NOOP 的 stdout JSON、`dataset_import_run.report_json` 必有非空 `warnings:string[]`，至少一条明确中文摘要：“固定数据包含193条到达晚于发车的源时刻记录（192个车次），原值未修正，仅供历史参考。”不得再声称全部时刻已核验正确。
- 两类完成流水的 report_json 同时保存 `validationPolicy:"MVP-C1.2"`、`sourceAnomalyManifestSha256`（上述清单文件哈希）、`knownSourceAnomalies`（完整193条、字段与清单 records 相同，按tripId二进制序/stopSequence排序）。已有JSON字段承载，无新表、无DB迁移；清单可作为同内容classpath资源随jar打包，不依赖开发机绝对docs路径。
- 公开警告：Dataset 与 ImportRun DTO 新增必有 `warnings:string[]`；正常无警告为空数组。该固定版本的 Dataset 必须带上述已知异常摘要，ImportRun 对 SUCCEEDED/NOOP 从各自 report_json 取警告；其他/历史流水没有警告字段时返回[]，不能从空数组推断数据时刻正确。`/context.dataset.warnings` 和 `/datasets/{v}/imports.items[].warnings`均可见；完整清单保存在持久报告与上述版本化文件供审计，不把193行重复下发每个车次。
- 11/19 在已有来源/版本信息区域显示就近的“源时刻含已知异常”提示并可查看警告摘要；单个车次/停站/几何DTO字段与排序保持不变，继续展示原始参考值，不称为已验证可衔接。几何READY仅表示源关联/区间边界匹配，不证明时刻正确；完整换乘/衔接功能仍后置。
- 既有active不得重建或被清理。首次用C1.2执行同包NOOP时，重新从固定包和当前active库核对193条异常集合，追加包含本政策、清单和警告的新NOOP流水，GTFS业务记录/active指针不变；不得直接复用旧的空warnings NOOP返回。旧流水不覆写，旧active不能仅凭已有哈希自动宣称满足C1.2验收。

验收应覆盖：正常193条完整匹配可激活/原值不变；少一条、多一条、改任一键/原时刻、重复、错误哈希均拒绝；重复NOOP与旧active补记均保留警告和全清单且行数/指针不变；新HTTP两处警告可见；其他硬失败不受例外影响。G7179/G531/T297 均不在此193条清单，原三样例预期不变。15的口径定稿不等于07通过，开发按本版调整并自测后再提交独立实现复审。

## 4. 本地初始化、导入和激活

后端 artifact 固定 `target/railflow-backend.jar`。下述为 07 要实现的入口，当前不是已存在的可执行程序。DB_URL/DB_USERNAME/DB_PASSWORD 来自 §9 的本地加载器，不出现在命令行密码参数或日志中。

```text
java -jar target/railflow-backend.jar --spring.profiles.active=schema --spring.main.web-application-type=none
java -jar target/railflow-backend.jar --spring.profiles.active=import --spring.main.web-application-type=none --railflow.import.file=<本地固定ZIP绝对路径> --railflow.import.version=gtfs-20261116-085531 --railflow.import.expected-sha256=4D60E72512C4595B516A5E13BE41235C87620A1C39D38FD2310E1094A5D9666D
java -jar target/railflow-backend.jar --spring.profiles.active=web
```

- schema profile 仅在授权的专用库执行本轮迁移 1；幂等建表/登记 schema_version，不覆盖未知旧结构，不 DROP DATABASE 或自动重建库。迁移 1 创建 dataset_active 并幂等插入 singleton_id=1、dataset_id=NULL 的初始行，已存在时保留原指针；激活事务必须实际锁到该行，缺失即 SCHEMA_NOT_READY。普通 web/import 不隐式初始化结构；缺结构明确失败。
- schema 与 import 均使用 `SELECT GET_LOCK(CONCAT('railflow-import-', DATABASE()),0)`；必须返回 1 才执行，0 报 IMPORT_IN_PROGRESS，NULL/异常按数据库失败处理。退出时在同一连接执行 `RELEASE_LOCK(CONCAT('railflow-import-', DATABASE()))`；不能用 SQL 的数值 `+` 拼接锁名。
- 整个 attempt 的所有批次写入、验证、清理、状态迁移和激活均使用获得锁的同一物理 JDBC 连接，批次 commit 不释放命名锁，不把写入交给其他池连接。该连接失效立刻终止本 attempt，不自动重连继续写、不让旧 worker 在锁已丢失后续写。新命令取得锁后才可判断遗留、恢复/重试；不得有未完成的异步写 worker。schema 也在持有同名锁的单连接中运行。
- 先校验入口、ZIP 哈希和九文件，再写 CHECKING/IMPORTING 流水及 IMPORTING 版本；相同 version_name 不同哈希报冲突。已 ACTIVE 且哈希一致时仍须完成§3.1的异常集合/警告审计后才记NOOP，原业务记录数和active指针不变，不先清数据。
- 首次/失败重试：仅向未激活 D 分批写入；每批建议 1000 行，索引按 §3，不保有全国数据对象。失败记录 FAILED，不切 active；失败的非 active 数据允许保留至下一次重试按 D 清理，不删除历史流水。
- 所有文件行数、字段、引用、覆盖、样例身份及§3.1的193条集合/警告报告检查通过后转 VALIDATING；通过后在短事务内锁 dataset_active 行，核对本次版本为 VALIDATING，原子切指针、将版本置 ACTIVE、成功流水置 SUCCEEDED。若指针已是不同的版本则报 DATASET_HASH_CONFLICT，保留原指针，不执行版本替换。已知源异常分类完成后可激活，并不表示所有源时刻正确。
- 本轮只允许固定 release；不提供版本替换、回滚或强制重导入入口，所以正常执行不存在第二个不同 ACTIVE 版本。测试若构造原 active 基线，失败/中断不得更新其指针或数据。后续多版本替换须另定迁移，不在本轮暗加状态。
- 进程强杀时 MySQL 自动释放命名锁；下次独占获得锁后，将遗留 IMPORTING/VALIDATING 流水登记 INTERRUPTED，确认该 D 非 active 才按 D 清理并重试。不能把“仍在导入”的活进程判断成遗留。
- 强杀前可能没有完整失败报告，不能要求强杀退出码固定；正常 CLI 退出码：0=成功/NOOP，2=输入/包校验失败，3=锁冲突，4=数据库/结构失败，5=其他运行失败。JSON 摘要含结果、运行 ID、哈希、记录数、耗时、错误码；禁止回显 JDBC 凭据、密码、完整外部堆栈。
- 07 将每表行数、DATA_LENGTH/INDEX_LENGTH（估算，标明统计时间）及输出报告记入台账；数据包、私有配置和中间日志仅留忽略目录。

## 5. 只读 HTTP

本轮历史公共数据只读 API 无需登录；没有用户资源写入或 `/api/admin/**`，不扩展账号功能。沿用统一错误体与原有 Session 技术约束；后续用户接口不得据此绕过 Session/属主。

所有 ID 原值大小写敏感，参数须 URL 编码；响应 UTF-8 JSON。datasetVersion 一律是 release 名；referenceServiceDate 为 ISO `YYYY-MM-DD` 且必填。日期默认只由 context 告知 UI，不在请求缺参时暗填。先验证参数格式，再查版本/active、覆盖日期、站点/车次身份和业务条件。

11/19 采用同源 HTTP 页面/API 访问；后端可挂载现有前端静态目录，保持 ES Modules 无构建步骤。不默认开放通配 CORS，额外跨源部署若需要则单独明确允许来源。07/08 不改前端业务代码。

| 方法/路径 | 参数与结果 |
| --- | --- |
| GET /api/mvp/context | 无参数；返回 Context。无 active 时 503 DATASET_NOT_READY。 |
| GET /api/mvp/stations | datasetVersion、q（去首尾空白后 1–64 字符）；offset 默认 0、limit 默认 50，范围 1–100。按 stop_id 二进制升序；名称或 ID 的字面包含匹配，转义 LIKE 通配符。返回 StationPage，未匹配是 200 空列表。 |
| GET /api/mvp/trips | datasetVersion、fromStopId、toStopId、referenceServiceDate；返回 TripSearch。枚举同 trip 全部满足起站序在前/终站序在后的停站对；同 trip 多次经过的匹配保留 board/alightSequence，不能按站名去重。 |
| GET /api/mvp/trips/{tripId}/stops | datasetVersion、referenceServiceDate；返回 TripStops，包括全趟停站和完整日期时间。该日未开行返回 409 SERVICE_NOT_RUNNING。 |
| GET /api/mvp/trips/{tripId}/geometry | datasetVersion、referenceServiceDate、fromStopId、toStopId、boardSequence、alightSequence（正整数，必须匹配该 trip 与站点）；返回 SegmentGeometry。 |
| GET /api/mvp/datasets/{datasetVersion}/imports | offset/limit 同 StationPage；active 版本的脱敏 ImportPage，按 runId 倒序。失败细节仅有标准错误码/中文信息，不含本地路径、连接信息或 SQL。 |

指定不存在版本返回 404 DATASET_NOT_FOUND；存在但非 active 返回 409 DATASET_NOT_ACTIVE。查询从 active 指针解析一次 D，在本次请求内使用同一个 D；不混合不同版本。未激活的业务记录不公开。

TripSearch 先查有无不限日期的顺序正确站对；无则 200 `items=[]/emptyReason=NO_DIRECT_TRIP`；有站对但参考日没有开行则 `items=[]/emptyReason=NO_SERVICE_ON_DATE`。反向站对若其他 trip 有该方向则正常返回，不能全局判反向无效。同一 stop_id 的起终请求为 422 SAME_STATION。超 feed 范围为 422 DATE_OUTSIDE_COVERAGE，不静默换日。

## 6. DTO（字段均必有，只有标 nullable 的字段可为 null）

JSON ID、日期和原始时刻是 string；sequence/seconds/count 为非负整数（sequence>0）；坐标为有限 number；时间戳为 ISO string。页面使用服务端顺序，不自行推荐/推算衔接。

- Dataset：`version:string, sha256:string, sourceUrl:string, feedVersion:string, coverageStart:string, coverageEnd:string, importedAt:string, coordinateSystem:"WGS84", attribution:string, files:DatasetFile[], warnings:string[]`；importedAt 取成功激活的 activated_at，而非下载/采集时间。warnings按§3.1提供版本级公开数据质量信息，不等于所选trip本身必然异常。
- DatasetFile：`fileName:string, sha256:string, sourceRows:integer, importedRows:integer, uncompressedBytes:integer`。
- Context：`dataset:Dataset, defaultReferenceServiceDate:"2026-11-16", dateMode:"SELECTABLE_REFERENCE_SERVICE_DATE", timezone:"Asia/Shanghai", capabilities:{directOnly:true,fares:false,transfers:false,geometry:true}, replayLabel:string`。
- Station：`stopId:string, stopName:string, longitude:number, latitude:number, coordinateSystem:"WGS84", locationType:integer`。不捏造 cityId/城市归属。
- StationPage：`datasetVersion:string, items:Station[], total:integer, offset:integer, limit:integer, hasMore:boolean`。
- StopTime：`stopId:string, stopName:string, stopSequence:integer, arrivalTime:string, departureTime:string, arrivalSeconds:integer, departureSeconds:integer, arrivalDateTime:string, departureDateTime:string, arrivalDayOffset:integer, departureDayOffset:integer`。原时刻保留超过 24 小时数值。
- TripSummary：`segmentId:string, tripId:string, trainName:string, serviceId:string, shapeId:string nullable, boardSequence:integer, alightSequence:integer, from:StopTime, to:StopTime`。trainName 优先 trip_short_name，空时 route_short_name，再空时 trip_id；不修改 tripId。segmentId 为 `tripId:boardSequence:alightSequence`，在同一版本/日期查询上下文唯一，不能代替完整运行身份。
- TripSearch：`datasetVersion:string, referenceServiceDate:string, fromStopId:string, toStopId:string, items:TripSummary[], total:integer, emptyReason:string nullable, replayLabel:string`；有结果 emptyReason=null，无结果仅上述两个值。
- TripStops：`datasetVersion:string, referenceServiceDate:string, tripId:string, trainName:string, serviceId:string, shapeId:string nullable, stops:StopTime[]`；stops 按 stopSequence 升序。
- SegmentGeometry：`datasetVersion:string, referenceServiceDate:string, tripId:string, shapeId:string nullable, fromStopId:string, toStopId:string, boardSequence:integer, alightSequence:integer, coordinateSystem:"WGS84", status:"READY"|"UNAVAILABLE", reason:string nullable, points:number[][], accuracy:"APPROXIMATE", method:"ORDERED_PROJECTION_200M_V1", fromDistanceMeters:number nullable, toDistanceMeters:number nullable, source:string`。points 是 `[longitude,latitude]` 数组；READY 至少两个有序不同位置点，reason=null、两端距离必有；UNAVAILABLE points=[]，reason 必有。不可将 READY 解读为当前开行、当前售票或已完成真实底图逐段核验。
- ImportRun：`runId:integer, status:string, startedAt:string, finishedAt:string nullable, elapsedMs:integer nullable, errorCode:string nullable, message:string, fileCounts:object, warnings:string[]`；状态为 §3 的流水状态。SUCCEEDED/NOOP按§3.1带可追溯警告，API不能继续只取files而漏掉warnings。
- ImportPage：`datasetVersion:string, items:ImportRun[], total:integer, offset:integer, limit:integer, hasMore:boolean`。

示例：参考服务日 2026-11-16，T297/HBB 的 `arrivalTime="26:06:00",arrivalSeconds=93960,arrivalDateTime="2026-11-17T02:06:00+08:00",arrivalDayOffset=1`；上车自然日可类似偏移，不用乘客途中上车日替换 service_id 的查询日。

## 7. 几何匹配、精度与缺失语义

轨迹始终来自同版本 shape，阈值是本轮明确的技术容差，不是已核实的测绘精度。固定包缺距离字段，采用以下保守、可复现判定，不能靠样例硬编码 shape 下标。

1. 按 shape_pt_sequence 读 WGS84 折线，去除相邻相同坐标但保留映射；小于两点为 INVALID_SHAPE。累计里程 s 用相邻点球面距离，保持形状原方向。
2. 对该 trip 的每个停站，将坐标投影到每条 shape 线段：在以站点为原点的局部等距近似平面 `x=R*cos(lat0)*(lon-lon0), y=R*(lat-lat0)`（弧度，R=6371008.8m）上作垂足，t 截到 [0,1]；得到 distance 和 s。非有限/越界站点坐标为 INVALID_STATION_COORDINATE。候选要求 distance<=200m。
3. 只保留沿连续折线的距离函数局部极小，不把所有相邻线段投影合并为一个 run。每段以未截断的垂足参数 u 判定：若 0<u<1，保留内部垂足；内部顶点仅在前段 u>=1 且后段 u<=0 时保留；首点仅在首段 u<=0、末点仅在末段 u>=1 时保留。u 接近 0/1 的判断 epsilon=1e-9。然后应用 200m 距离阈值；仅将沿线 s 相差<=0.01m 的同一顶点/同一位置数值重复去重。不同 s 的两次经过即使坐标相近、线段相邻、s 间隔不足 400m，也必须分别保留，不能强选全局最近点。
4. 在全趟 stop_sequence 顺序上保留 s 非递减的可行候选链；可用前向/后向可达性计算，不能指数枚举。无候选或无可行链为 BOUNDARY_UNRESOLVED；多个可行链若所乘起/终任一端仍对应多个不同 s 候选，为 BOUNDARY_AMBIGUOUS；只有两端候选均唯一且 sFrom<sTo 才允许返回 READY。
5. 从原始 shape 取 sFrom 到 sTo 的折线，边界使用对应投影点，仅保留中间原始点，去除相邻重复点。不得追加车站到 shape 的直线、继续画到整趟终点、按停站下标切 shape 或强制反转轨迹来通过验收。
6. 无 shape 关联/无对应点时为 NO_SHAPE；shape 不合法为 INVALID_SHAPE；站点坐标不合法为 INVALID_STATION_COORDINATE；200m 内无候选/顺序无法满足为 BOUNDARY_UNRESOLVED；多重匹配为 BOUNDARY_AMBIGUOUS。上述均 HTTP 200 + UNAVAILABLE，不清掉文字车次，不冒充 HTTP 故障。

通过边界定位仅表示“源关联与顺序边界可匹配”。200m 容差内的端点为近似，DTO 保留距离与 accuracy；实际铁路走向仍必须在真实底图逐段核对。若真实样例不满足上述规则，登记测量/失败交决策修订，不提高容差或硬选最近点掩盖失败。

必测短回折反例：以站点为原点的米坐标 shape `(-2000,0),(-75,0),(75,0),(75,40),(-75,40),(-2000,40)`。两次经过的候选 s 约 2000m/2190m、距离 0m/40m，虽相邻且间隔<400m仍是不同候选；若停站顺序不能消歧，必须 UNAVAILABLE/BOUNDARY_AMBIGUOUS。重复顶点的两侧表示只能去重成同一 s，不能借去重删除另一次经过。

## 8. 错误与验证矩阵

非 2xx 统一为 `{"error":{"code":"...","message":"中文可读信息"}}`，不增加另一套 envelope。成功 DTO 直接作为响应体。格式校验不访问外部服务；消息不能包含敏感信息。

| HTTP | code | 语义 |
| --- | --- | --- |
| 422 | VALIDATION_FAILED | 缺参、格式/类型/长度/页参数不合法、非法 ISO 日期 |
| 422 | SAME_STATION | 起终 stop_id 相同 |
| 422 | DATE_OUTSIDE_COVERAGE | 参考服务日超 feed 两端范围 |
| 422 | SEGMENT_ORDER_INVALID | geometry 序号非起<终，或序号与 trip/站点不对应 |
| 404 | DATASET_NOT_FOUND / STATION_NOT_FOUND / TRIP_NOT_FOUND | 标识在指定版本不存在 |
| 409 | DATASET_NOT_ACTIVE / SERVICE_NOT_RUNNING | 已知版本未激活 / 所选 trip 当日未开行 |
| 503 | DATASET_NOT_READY / DATABASE_UNAVAILABLE | 无可用 active 版本 / DB 不可用 |
| 500 | INTERNAL_ERROR | 未预期故障，脱敏记录内部诊断 |

CLI 错误码另有 IMPORT_IN_PROGRESS、DATASET_HASH_CONFLICT、PACKAGE_HASH_MISMATCH、PACKAGE_CONTENT_INVALID、SCHEMA_NOT_READY、IMPORT_INTERRUPTED、IMPORT_FAILED；无 HTTP 导入端点，所以不能硬映射成未定义的 HTTP 操作。

07/08 至少留证：首次整包成功；同包重复 NOOP；损坏包校验失败且 active 不变；无 active 时中断→请求不可读→重试恢复；已有 active 基线时失败/中断保留（允许独立测试库的受控 fixture 验证状态不变式，明确非真实样例成功证据）；锁冲突；全部文件及表行数一致；真实 MySQL 耗时/存储。

三样例均以参考服务日 2026-11-16：G7179 `5l000G717920` NKH seq1→AOH seq5；G531 `240000G53106` VNP seq1→NKH seq10，不延伸至 AOH；T297 `240000T2971H` BJP seq1→HBB seq8，不延伸至 MDB。另测反向请求（仅当确无该方向候选时为空）、同站、有效范围内日历未命中、超范围、真实无 shape、人工受控边界歧义/顺序冲突、26:06:00/70:57:00 累计时刻。源关联、投影/裁剪算法及 JSON/错误契约需自动化验证，真实铁路走向由 11/19 独立核验。

## 9. 本地数据库与授权边界

用户明确授权复用已装 MySQL 8.4，在 `D:\test\RailFlow\output\mysql-mvp` 启动 RailFlow 独立实例，仅监听 127.0.0.1:3307；专用库为 railflow_mvp_dev、railflow_mvp_test。不安装系统服务，不改 3306 或 `D:\data\mysql-trade`。

连接值仅保存于当前 Windows 用户可访问、Git 忽略的私有目录；不把实际 JDBC URL、账号或密码复制进版本化文件。开发在同一个 PowerShell 进程 dot-source 以下加载器后运行 Java/Maven：

```powershell
. 'D:\test\RailFlow\output\mysql-mvp\load-env.ps1' -Database dev
# 或在独立测试命令的同一进程中使用 -Database test
```

加载器设置 DB_URL、DB_TEST_URL、DB_USERNAME、DB_PASSWORD；不输出值，不将密码置命令行，不全局设置用户级环境变量。每个新的 shell 都要重新加载；环境变量仅影响该进程及其子进程。

允许 07 使用专用账号在上述两库创建所需表/索引、执行本轮迁移及写入 GTFS；可清理本轮失败的未激活 D，测试库可清理本轮自建测试表/fixture。禁止 DROP DATABASE、对另一项目/系统库写入、清理已激活版本或借初始化覆盖未知表结构；不向编码 agent 提供 root 凭据。DDL 权限已用创建→插入→查询→删除本轮临时探针表实测，两库均成功；这不代表 GTFS 表已经建立或已导入。

生命周期：本地实例保持运行供 07/08 使用；重启使用本私有目录 my.ini 与已装 mysqld，端口已占用时核对实例身份，不再初始化数据目录或杀其他实例。停止/重新初始化须确认仅为此实例；本轮不自动回收它。

## 10. 接续与来源

05/06 通过后，07/08 接收本契约和私有环境加载器，在原任务追加解阻依据；不覆盖此前阻塞历史。开发交付另出 `handoff/20261118-08-backend.md`，本契约不是实现验收。

- [GTFS 官方 Schedule 参考](https://gtfs.org/documentation/schedule/reference/)：服务日、累计时刻、shapes 与 translations 字段语义；本固定包实测字段优先按 §2/§3 映射，未新增字段不强行推断。
- [MySQL 8.4 初始化说明](https://dev.mysql.com/doc/refman/8.4/en/data-directory-initialization.html)：独立数据目录初始化；本机已实际完成安全的本地初始化及账号设密，未安装新二进制。
- 固定数据的来源、哈希、九文件表头、行数、样例身份与只读精度测量见 §2 及开发核查交接；检索/核对日期为 2026-11-18。

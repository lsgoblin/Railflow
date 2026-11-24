# 城市行程历史回放

城市行程使用固定历史数据包 `gtfs-20261116-085531`，以有序城市、实际车站、开行日期和前后程衔接为约束。阶段安排见 [开工清单](../step/README.md#全量城市与地图行程)。

## 功能范围

1. **全量城市与车站目录**。覆盖固定 GTFS 的 3,180 个站点及其所属的全部城市。沿用 GTFS 的 `stop_id`、站名和坐标，补齐可追溯的城市归属及地图定位。用户可按城市名、站名和站码搜索，通过所属城市和站码区分同名站。
2. **地图点选组行程**。直接点击可选城市标记，按点击顺序加入同一份有序行程。搜索也可加入同一行程。第一个城市建立起点，后续城市加入即触发重算。两个、三个、四个及更多城市沿用同一流程。
3. **自动选站和重算**。系统匹配满足行程约束的实际到发站和车次。未指定站点时，沿用 [需求 §4.1](design-spec.md) 的候选站顺序。添加、移除、重排城市或手动改站后，自动重算受影响区间及其依赖，并可调整前面自动匹配的车站和车次。用户指定的到发站保留。
4. **点选的中间城市默认停留一天**。默认下车停留，按实际到达后的下一自然日安排续程。系统安排的换乘点及列车普通经停保持各自的时刻衔接口径。
5. **全程换乘最少**。自动搜索直达和换乘方案，按全程换乘次数从少到多推荐。即使某段有可续程的直达，也比较可能减少全程换乘次数的换乘方案。系统安排的换乘站显示为换乘点。允许同城跨站换乘，显示实际到站和下一程离站。跨站候选通过接驳时间校验后才可作为已验证可行的路线使用。
6. **实际车站与铁路轨迹**。列表显示实际到发站、车次和换乘点，地图同步绘制带有实际铁路几何的区间。无可行路线时保留城市输入并标出受影响的区间。几何缺失时显示对应状态。日期超出覆盖和服务失败各有反馈。
7. **统一主页入口**。用一份城市行程完成点选、搜索、选站和展示。移除旧“两站直达”独立入口及手动匹配按钮，复用已有站间直达查询、开行日历和轨迹能力。

## 功能验收标准

- 目录导入按 GTFS 版本和站点标识对账，重复导入结果一致。全部 3,180 个站点均需有可追溯的城市归属，无法核实的站点进入差异记录并在全量验收前处理。
- 用真实 GTFS 走通两城、三城和四城。验证全程换乘最少、无直达自动换乘、点选城市次日续程、同城跨站的时间校验，以及用户指定站与自动重算共存。两条路线均可续程时，首段直达的方案若全程换乘两次，首段换乘的方案若全程只换乘一次，应推荐后者。地图轨迹应与实际乘坐区间一致。
- 跨站接驳时间的来源和缓冲仍待细化。首次出发和点选停留后的首次上车搜索当个可出发自然日。同站换乘的最短间隔由调用方明确给出；换乘按实际时刻衔接，可跨午夜。历史票价、余票及 AI 功能按各自范围推进。

## 目录数据和来源

- 目录绑定固定版 GTFS 的版本名与 SHA-256。站名、站码和 WGS84 坐标取自其 `stops.txt`。`gtfs-20261116-085531-city-stops.tsv` 为站码与城市的关联，读取时与已导入站点按 `stop_id` 全集合核对。完整快照包含 3,180 个站码和 350 个城市分组。
- 主来源 `ctamap-v2-2026` 为 Cheng, Rui、Hu, Yunfeng、Xiao, Chiwei、Wang, Yanjun 的 CTAmap v2.0 `T2026_prefecture.gpkg`，2026-01-01 快照，WGS84，CC BY 4.0。根据站点与多边形的相交结果衍生行政区划代码、名称和省级归属，不分发原始边界。对近界点、坐标重合及站名与坐标冲突的样例另核对。文件 SHA-256 为 `6A35915313444D4E669FDC147EADE4EB50D67489C38C00F340D871BAA624AD85`。[版本与许可](https://www.shengshixian.com/pages/d35ae5/) · [版本归档](https://doi.org/10.5281/zenodo.22179207) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- `laos` 覆盖磨丁、孟赛、琅勃拉邦、万荣、万象五站。站址资料用于确认城市，`la-` 前缀的城市 ID 为本目录内部标识。[国家发改委](https://www.ndrc.gov.cn/fggz/lywzjw/202206/t20220629_1374240.html) · [中国中铁](https://www.crecg.com/web/xwzx61/gsyw87/2025021110050183810/index.html) · [云南省交通运输厅](https://jtyst.yn.gov.cn/html/2023/meitijujiao_0418/128366.html) · [上海市商务委老挝报告](https://desk.sh.gov.cn/zxfw/yjbg/gbbg/index/7dd04ae29bdf4b648fa5f2125f8976a7.pdf)
- `xikang` 纠正牛背梁、柞水西、镇安西和安康西的归属。这四条站码在原包均与西安东重合。`leshancity` 将关村坝关联至乐山金口河。两种校订保留 GTFS 原坐标，排除这些坐标作为城市定位点。[西安市政府](https://www.xa.gov.cn/gk/zdjsxm/xmsg/2101484047655026690.html) · [陕西省交通运输厅](https://jtyst.shaanxi.gov.cn/static/home/nianjian/2022/5.pdf) · [人民网关村坝站报道](https://sc.people.com.cn/n2/2026/0914/c379470-41694962.html)
- `puan-border` 保留站点坐标所在的六盘水，站场横跨六盘水和黔西南。`daxing-border` 保留高铁站点坐标所在的廊坊，机场服务范围跨京冀。[普安县站跨界资料](https://www.yp.gov.cn/contents/2023/05/11/receive-f3adc006-71eb-4c63-8a89-07f3458536af.html?stm=1692022391259) · [大兴机场站相关线路资料](https://static.sse.com.cn/disclosure/bond/announcement/local/c/new/2025-03-17/0000_20250317_9XKV.pdf)
- 近界抽查中，沙湖站坐标落在银川，木竹河站坐标落在遵义，营盘水站坐标落在中卫，与站址资料一致。[沙湖站环评资料](https://www.mee.gov.cn/ywgz/hjyxpj/jsxmhjyxpj/xmslqk/201807/W020230403378873667207.pdf) · [贵州省水功能区划](https://sthj.guizhou.gov.cn/zwgk/zcwj/tjwj/202510/P020251009623890083855.pdf) · [营盘水站资料](https://xinwen.bjd.com.cn/content/s66445a39e4b0f5cd59e2a87d.html)
- 城市定位优先使用同名站，否则使用最接近该城市有效站点平均坐标的站点。城市、站名、坐标均相同的记录共用 `stationGroupId`，组内保留全部原站码。异名站即使坐标重合也各自保留。

### 异名共坐标的站点归属

固定 `stops.txt` 有 4 组、12 个异名共坐标站码。下表记录按站址核对的城市归属。每站保留原站码、站名和 WGS84 坐标，共用坐标排除在城市定位锚点之外。

| 站码 | 已核对的城市归属与来源 |
| --- | --- |
| 日月峡 `RYB` | 绥化市庆安县（`231200`，`qingan-station-report`）。庆安县公开工程报告 §1.1.1.1 明确说明车站的行政区划，§2.1.1 所列站房边缘外接驳工程起点 `[128.351111, 47.207500]` 亦落在 CTAmap 绥化市范围。该点用于佐证归属。伊春市报道将日月峡列入伊春客运网络并概述线路经过，其市域表述与工程报告有出入。目录以明确指向站址行政区划的工程报告为据。[庆安县工程报告](https://www.hljqingan.gov.cn/qa/gsgg/202603/229957/files/%E5%93%88%E4%BC%8A%E9%AB%98%E9%93%81%E9%93%81%E5%8A%9B%E6%97%A5%E6%9C%88%E5%B3%A1%E7%AB%99%E8%BF%9E%E6%8E%A5%E7%BA%BF%E5%B7%A5%E7%A8%8B%E9%A1%B9%E7%9B%AE%E6%B0%B4%E5%9C%9F%E4%BF%9D%E6%8C%81%E6%96%B9%E6%A1%88%E6%8A%A5%E5%91%8A%E4%B9%A6-%E7%9B%96%E7%AB%A0.pdf) · [伊春市线路报道](https://www.yc.gov.cn/ycsrmzf/c101986/202609/435148.shtml) |
| 伊春西 `AXB`、铁力 `TLB` | 伊春市（`230700`，`ha-yi-station-sites`）。伊春西站位于乌翠区，铁力站位于伊春代管的铁力市。[伊春西站配套批复](https://www.yc.gov.cn/ycsrmzf/gzdt/202404/348072.shtml) · [铁力站房启用](https://www.tls.gov.cn/newtlsrmzf/c104410/202501/387469.shtml) · [伊春市下辖区划](https://www.yc.gov.cn/ycsrmzf/c101994/202112/161447.shtml) |
| 呼兰北 `KYB`、兴隆镇西 `XWB` | 哈尔滨市（`230100`，`ha-yi-station-sites`）。分别位于呼兰区和巴彦县，许可按各自车站列明。[哈尔滨市行政许可](https://hrbcredit.harbin.gov.cn/notice.do?flag=double&method=showDetail&xzxdr=%E9%BE%99%E6%B1%9F%E9%93%81%E8%B7%AF%E6%9C%89%E9%99%90%E8%B4%A3%E4%BB%BB%E5%85%AC%E5%8F%B8) |
| 成都龙泉驿 `CEE`、成都西 `CMW` | 成都市（`510100`，`chengdu-station-sites`）。分别核对龙泉驿区大面街道站房和青羊区的铁路成都西站。[龙泉驿站投运报道](https://sc.people.com.cn/n2/2026/1029/c345509-41736595.html) · [青羊区成都西站经营场所文件](https://cdsqyq.sczwfw.gov.cn/module/download/downfile.jsp?classid=0&filename=3d1c73d293724f5baeaec4e7f8d19c28.pdf) |
| 西安东 `XDY`、安康西 `APY`、牛背梁 `NGY`、柞水西 `ZCY`、镇安西 `ZTY` | 西安东在西安市灞桥区（`610100`，`xian-east-plan`）。安康西在安康市（`610900`）。牛背梁、柞水西在商洛市柞水县，镇安西在商洛市镇安县（`611000`）。后四站沿用 `xikang`。[西安东站核心区规划](https://zygh.xa.gov.cn/ywpd/cxghgsgb/ghglpqgs/64e487b0f8fd1c1a703759e1.html) · [西康高铁车站站址](https://www.xa.gov.cn/gk/zdjsxm/xmsg/2101484047655026690.html) · [西康高铁环评](https://www.mee.gov.cn/ywdt/gs/wqgs_1/201811/W020181123562412482576.pdf) |

## 城市目录与历史规划接口

接口前缀 `/api/replay`。读固定历史数据，响应无用户账号或行程持久化。统一错误体沿用 [MVP 契约 §8](mvp-contract.md)。

| 接口 | 请求 | 结果 |
| --- | --- | --- |
| `GET /cities` | `datasetVersion` | `datasetVersion`、`stationCount` 和 `items[]`。每个城市含 `cityId`、`name`、`administration`、WGS84 经纬度、`anchorStopId`、`stationCount`（GTFS 码数）和 `stationGroupCount`。 |
| `GET /cities/{cityId}` | `datasetVersion` | `item.city` 和 `item.stations[]`。车站按 `stop_id` 升序，每项含 `cityId`、`membershipSource`、`stationGroupId` 和原 MVP `station`。 |
| `GET /locations` | `datasetVersion`、`q`，可选 `offset`、`limit` | 按城市名、站名、站码字面包含检索。`items[]` 先列 `CITY` 再列 `STATION`，站点项携带所属城市，分页返回 `total`、`offset`、`limit` 和 `hasMore`。 |
| `POST /plans` | JSON 对象，见下文 | 有序 `nodes[]`、各段 `legs[]`、`dateOffsetDays`、可空 `failedLegIndex` 和 `emptyReason`。 |

规划请求包含 `datasetVersion`、行程首日 `departureDate`、对应参考自然日 `referenceDate`、正整数 `minimumTransferMinutes` 和至少两个有序 `nodes[]`。节点包括 `cityId`，可选 `arrivalStopId`、`departureStopId` 和 `stayDays`。中间节点 `stayDays` 为正整数，缺省为 1；起终点归一为 0。显式指定站码必须属于节点城市。参考日超覆盖返回 422，未知城市返回 404，库不可用返回 503。若起始日有效但某段无法匹配，返回 200 并保留节点和已匹配的前缀，标识首个未完成段与 `NO_ROUTE` 或 `DATE_OUTSIDE_COVERAGE`。

规划先搜索可续程的直达，再搜索仍可能减少全程换乘次数的同站换乘方案。按各候选的可续程日期计算后续方案，比较本段与后续各段的换乘次数合计。同等换乘数沿用现有候选遍历顺序。中间城市可按明确指定使用不同的到发站。系统换乘要求同一 `stationGroupId`，按调用方传入的最短时间校验。列车是否开行由自身 `referenceServiceDate` 决定，首次上车和停留后续程的自然日由累计时刻计算。每段 `trains[]` 含实际到发城市、车次区间 `trip`、参考服务日及按统一偏移换算的发到日期时刻。各段实际站码、序号、车次和参考服务日可直接请求既有停站和轨迹接口。

参考发到及回放发到统一采用固定北京时间 `UTC+08:00` 和 24 小时制。偏移自然日时保留发到钟点，回放日期不应用历史夏时制。原始 GTFS 累计时刻保留跨日数值。

规划检查每段实际乘车区间的站内到发次序和相邻站间的时序。候选在上车站、下车站或途经站依赖逆序时刻时，继续搜索其他候选。时序正常的同车次区间仍可匹配。仅剩异常候选时走既有无可行路线响应。原始时刻仍由 MVP 停站查询原样提供。

<a id="首批目录"></a>

## 三城归属核验样例

以下 14 站来自已退回的三城原型，保留作归属核验样例。站点标识、名称和 WGS84 坐标取自固定版 `stops.txt`，归属按下表资料核对，查阅于 2026-11-23。原型采用同名站的 GTFS 坐标作为城市标记定位点。

| 城市 ID | 地图定位点 `[经度, 纬度]` | 候选站 `stop_id` | 归属依据 |
| --- | --- | --- | --- |
| `beijing` 北京 | `BJP` `[116.421013, 39.901117]` | 北京 `BJP`、北京西 `BXP`、北京丰台 `FTP`、北京朝阳 `IFP`、清河 `QIP`、北京北 `VAP`、北京南 `VNP` | [北京市交通委的七座铁路客运枢纽说明](https://jtw.beijing.gov.cn/xxgk/dtxx/202206/t20220622_2748859.html) |
| `nanjing` 南京 | `NJH` `[118.792240, 32.089124]` | 南京 `NJH`、南京南 `NKH` | [南京市政府办公厅的市区内铁路主要车站定义](https://www.nanjing.gov.cn/zdgk/202402/t20240229_4176581.html) |
| `shanghai` 上海 | `SHH` `[121.451165, 31.251557]` | 上海虹桥 `AOH`、上海松江 `IMH`、上海 `SHH`、上海南 `SNH`、上海西 `SXH` | [上海市铁路客运站指南及站址](https://english.shanghai.gov.cn/en-Transportation/20250126/484b92f86eeb49d7b26086d25010d782.html) |

## 已退回原型的接口记录

以下接口属于已退回原型。新版接口随开发按上文功能范围定义。

- `GET /api/mvp/cities?datasetVersion=...` 返回 `datasetVersion` 与 `items[]`。每项包含 `cityId`、`name`、`administration`、`longitude`、`latitude`、`coordinateSystem` 和按 `stop_id` 升序排列的 `stations[]`。站点字段沿用 [MVP 契约 §6](mvp-contract.md)。
- `GET /api/mvp/city-trips` 必填 `datasetVersion`、`fromCityId`、`toCityId`、`referenceServiceDate`。可选 `fromStopId`、`toStopId` 分别固定该端站点，站点须属于该城市目录。使用 `TripSearch` 字段返回首个可行组合的直达区间。组合先按出发站 `stop_id` 升序，再按到达站 `stop_id` 升序，同站组合跳过。
- 全部组合无解时返回 HTTP 200，`fromStopId`、`toStopId` 为 `null` 且 `items` 为空。存在直达时刻但参考日无开行返回 `NO_SERVICE_ON_DATE`，其余返回 `NO_DIRECT_TRIP`。日期超出覆盖或指定站不属于城市时返回 422。未收录城市返回 404。数据版本、服务异常及所选区间的几何请求沿用 MVP 契约。

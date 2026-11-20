# 界面原型附件来源

本目录七张图分两层：四张是 2026-11-20 00:18（对应 11-19 的实现与验收状态）在已实现 MVP 上实拍的核心结果态，三张是 2026-11-17 版本界面的完整产品目标态原型。两层不混用，图内来源署名与"历史回放"短标均原样保留，未裁切、未改字。

## 1. 已实现 MVP 核心结果态（2026-11-20 00:18 实拍）

采集条件：本地 `web` 部署（同一 Spring Boot 进程托管前端与 `/api`），真实 MySQL 中的固定 GTFS 包 `gtfs-20261116-085531`，参考服务日 2026-11-16，真实高德 JS API 底图；1440×900 视口，系统 Chrome 无头驱动。数据链路已通过独立审核与用户逐项验收，但图片本身只证明界面呈现，不替代验收记录。

| 附件 | 对应状态 | 原始文件 | 尺寸 |
| --- | --- | --- | --- |
| [候选结果列表](ui-result-list.png) | VNP → AOH，40 条直达 | `output/course-shots/result-list.png` | 1440×900 |
| [选中区间与真实轨迹](ui-result-segment.png) | G531，VNP seq 1 → NKH seq 10（全程 13 站取前 10 站） | `output/course-shots/result-selected.png` | 1440×900 |
| [跨日区间](ui-result-crossday.png) | T297，BJP seq 1 → HBB seq 8 | `output/course-shots/result-crossday.png` | 1440×900 |
| [轨迹不可用](ui-result-unavailable.png) | K339，无 shape 关联 | `output/course-shots/result-unavailable.png` | 1440×900 |

## 2. 完整产品目标态原型（2026-11-17 版本界面）

三张图来自当时的开发自测截图，原样复制。该版界面包含多城市节点编辑、AI 助手页签与我的行程；随后 MVP 收敛，当前实现只挂载同车次直达回放，因此这些图只作完整产品的界面设计参考，不能读作当前已实现界面。

| 附件 | 原始工作区文件 | 尺寸 |
| --- | --- | --- |
| [桌面组线](ui-desktop-route.png) | `output/accept-1440-route.png` | 1440×900 |
| [手机抽屉](ui-mobile-route.png) | `output/accept-390-half.png` | 390×844 |
| [AI 未接入](ui-ai-unavailable.png) | `output/accept-ai-unavailable.png` | 1440×900 |

图中的"示例数据""2025 版"与合成轨迹属于当天的夹具，不能解释为固定 GTFS 包或当日实际开行；AI 失败画面不证明多轮已接入。手机实机、软键盘、地图手势、命中与来源区仍需验证，详见 [UI/UX](../ui-ux.md)。

# RailFlow 文档

| 分类 | 位置 | 内容 |
| --- | --- | --- |
| 初始材料 | [initial/](initial/README.md) | 教师任务书、项目构想和功能范围。 |
| 功能清单 | [feature-list.md](design/feature-list.md) | 按模块列出功能、本轮 MVP 是否需要完成及对应验收，单列待确认和范围外事项。 |
| 当前实施范围 | [feature-list.md](design/feature-list.md#mvp) | 2026-11-17 定稿的 MVP：GTFS 整包导入与同车次区间轨迹；完成要求、后置项与验收要点已合入功能表。 |
| 当前需求 | [design-spec.md](design/design-spec.md) / [design/](design/README.md) | AI 多轮个性化与保存、主页实际铁路点亮、地图组线、自然日停留、历史时刻/票价；余票暂不处理。 |
| 课程设计交付 | [course-delivery/](design/course-delivery/README.md) | 作业 2 的九类提交稿、六张设计图、七张原型与[交付物清单](design/course-delivery/delivery-checklist.md)；按 2026-11-19 实现状态修订并已通过独立复核。 |
| 课程设计交付（英文版） | [course-delivery-en/](design/course-delivery-en/README.md) | 同上九类产物的英文定稿，供英文提交使用；六图已用英文重制，截图保留界面原语言。 |
| 历史设计与前后端 | [archive/20261116/](../archive/20261116/README.md) | 原铁路购票设计、图集、截图、前端与后端初始化工程，原样归档。 |
| 协作规则 | [AGENTS.md](../AGENTS.md) | 决策、search、开发、review 四类职责与工作边界。 |
| 任务规划 | [../tasks/](../tasks/README.md) | 唯一任务主表、每日进展与审核状态。 |
| 历史交接 | [../handoff/](../handoff/README.md) | 跨角色/上下文接续快照及原 management 管理记录。 |
| 汇报材料 | [../PPT-final/](../PPT-final/) | 汇报 PPT、讲稿 PDF 与讲稿 Markdown（成品）。 |
| 历史环境证据 | [初始化台账](../tasks/20261116-tasks.md#20261116-02) | 旧工程环境检查与初始化证据；历史运行入口见 archive。 |

地点数据按本地城市/铁路车站与高德其他地点查询分工，详见当前需求 §8.1；底图和真实铁路轨迹不由地点查询替代。

铁路初测采用固定多日 GTFS 包与关联 shapes；本轮按 [MVP 契约](design/mvp-contract.md)使用原始参考服务日、九文件整包导入与同车次区间轨迹，D0/R0 映射后置。完整产品的统一日偏移仍见需求 §6.1–6.3、§8.2；历史票价另补，实际几何与回放仍待对应运行核验。

前端样例已有源码与开发自测记录，仍待独立审核；后端业务尚未实现。当前实施范围见 [feature-list.md](design/feature-list.md#mvp)，状态以 [每日台账](../tasks/README.md) 为准。日志与中间证据分别放在根目录 `log/`、`output/`，交接历史放 `handoff/`。`docs/management/` 已撤销，其历史内容见交接索引。

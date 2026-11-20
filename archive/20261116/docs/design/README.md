# RailFlow Design

本目录保存需求与系统设计，作为实现的依据。设计产物对应课程作业 Part II（设计部分）的要求，文档均为中文 Markdown，架构与建模视图以 SVG 设计图嵌入文档。

## 设计方向

- 后端采用 **Java 17 + Spring Boot 3 + MyBatis + MySQL 8**（2026-11 决定，替换此前倾向的 Python 方案）。
- 数据与状态从 Part I 前端原型的 localStorage 迁移到服务端数据库。
- 在核心功能上新增 AI 能力：**一句话查票**（已确认，本迭代实现）；候选功能评估见 ai-features.md。
- AI 只做查询预填、失败回退表单，不接触任何交易接口。

## 文档索引

**需求**

- [基本功能需求](requirements.md) — Part I SRS（未变更，业务规则 1–10 继续有效）
- [需求更新与变更日志](requirements-update.md) — 技术约束变更 C1–C5、新增 FR-AI-1 与非功能需求

**设计产物（对应作业要求的 9 项）**

- [设计图集与导出文件](diagrams/index.md) — 11 张设计图（10 张 FigJam 图 + 1 张领域类图），正文直接嵌入 SVG，另附 PNG 与可编辑图源
- [设计摘要](design-summary.md) — ① 进展、变化与当前状态
- [架构与关键决策](architecture.md) — ② 三视图、ADR-001~008、质量属性、智能体护栏
- [设计模型](design-models.md) — ③ 领域类图与数据关系、状态机、核心用例顺序图
- [REST 接口设计](api.md) — ③ 的实现契约：端点、鉴权、错误码、幂等与规则对应
- [更新后的需求](requirements-update.md) — ④ 变更日志 C1–C5、FR-AI-1 与新增非功能需求
- [UI 与 UX 设计](ui-ux.md) — ⑤ 界面改动、界面截图与一句话查票用户流程
- [未决问题与风险](open-issues-risks.md) — ⑥ 未决问题 Q1–Q7、风险清单与 PoC 验证计划
- [AI 工具使用反思](ai-tools-reflection.md) — ⑦ 使用环节、架构评估实例、贡献与局限
- [带批注的参考文献](references.md) — ⑧ 六个来源及其对设计的影响
- [团队成员贡献](team-contributions.md) — ⑨ 单人项目的分工与决策评审记录

**AI 专项**

- [AI 功能设计](ai-features.md) — 全环节评估表、P0 详细设计与不建议做的功能

**参考**

- [作业 2 原文（PDF）](<System Analysis & Design Assignment_2.pdf>) / [中文翻译](<System Analysis & Design Assignment_2 中文翻译.md>)

## 后续

- 汇报 PPT（12 页，第 25 组）已上传 Canvas 并完成彩排（2026-11-16），成品在仓库 `PPT-final/`；`PPT/` 是构建工作区，已 gitignore。
- 按 [敏捷开发方式](../management/README.md)，Part III 以智能体化开发构建原型与 PoC，验证 [open-issues-risks.md](open-issues-risks.md) §3 列出的五项设计决策；代理约束见根目录 [AGENTS.md](../../AGENTS.md)。

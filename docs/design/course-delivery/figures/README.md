# 课程设计图件

本目录六张图依据 CD-20261119 课程稿生成并核对，PNG 用于直接阅读，SVG 保留可编辑文字、图形与连线。图件表达目标设计，不是运行日志或独立审核结果；正文解释以各份交付文档为准，本轮实现状态见[交付说明](../README.md)。

| 图号 | 主题 | 阅读版 | 可编辑版 |
| --- | --- | --- | --- |
| 1 | 系统结构与职责 | [PNG](01-system-architecture.png) | [SVG](01-system-architecture.svg) |
| 2 | 部署与信任边界 | [PNG](02-deployment.png) | [SVG](02-deployment.svg) |
| 3 | 领域结构与关联基数 | [PNG](03-domain-model.png) | [SVG](03-domain-model.svg) |
| 4 | UC-01 城市组线与规划交互 | [PNG](04-planning-sequence.png) | [SVG](04-planning-sequence.svg) |
| 5 | UC-02 AI 多轮修改与版本保护 | [PNG](05-ai-update-sequence.png) | [SVG](05-ai-update-sequence.svg) |
| 6 | 两种入口与共同用户流程 | [PNG](06-user-flow.png) | [SVG](06-user-flow.svg) |

用例编号与[需求](../requirements-update.md)、[模型](../design-models.md)一致。图 1 为系统容器/职责概览，内部模块由架构正文表格展开；图 2 单独表达部署。图 3 是简化领域结构，完整对象、属性与不变式见模型正文。图 4/5 按时间向下阅读，虚线为参与方生命线，带箭头连线为消息方向。

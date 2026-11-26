# AI 助手会话接口

会话与待补条件由当前页面维护。AI 回合提取用户本轮新增或修改的条件，以现有有序行程和待补条件作为上下文。铁路事实来自[历史规划及轨迹](city-replay.md)，遵循[需求 §7](design-spec.md#7-ai-个性化多轮修改与保存)和[前端规范 §8.1](frontend-spec.md#81-对话与规划结果)。

## 请求与响应

`POST /api/ai/intent` 接受 JSON `{ "message": "今天从北京南站出发去哈尔滨", "context": {} }`。`message` 长度为 1～1000 个 UTF-16 代码单元，`context` 为 JSON 对象，序列化后最多 6000 个代码单元。上下文可包含当前起终点、停留顺序、日期、最短换乘间隔、偏好及待补条件。服务端将这些内容发给已配置的模型服务。

| 响应字段 | 含义 |
| --- | --- |
| `origin`、`destination` | 用户本轮明确给出的城市、站名或站码。 |
| `region`、`suggestedCity` | 区域目标及可修改的城市建议。已明确目的地的行程须选择建议或补充具体城市后才更新。 |
| `departureDate`、`referenceDate` | `YYYY-MM-DD`。相对出发日由服务端按 `UTC+08:00` 的自然日解析。`referenceDate` 仅在本轮明确调整历史参考日时返回。 |
| `minimumTransferMinutes` | 本轮给出的正整数分钟数。 |
| `preference` | 本轮提出的会话偏好。空字符串表示撤销。偏好可回显和纠正，车次仍按历史规划的既有规则匹配。 |
| `stops[]` | 条目含 `place`、`action` 和可空的 `stayDays`。`STOP` 添加停留或修改天数，`REMOVE` 移除中间节点，`CLEAR` 撤销待补条件。`UNCLEAR` 补问经过、换乘或下车停留。`PASS` 与 `TRANSFER` 表示待规划能力支持的条件，当前提示调整。 |

标量为 `null` 或停留数组为空时沿用已有条件。客户端使用固定版目录解析地点。条件满足时调用 `/api/replay/plans`，完整匹配后更新共用行程并获取区间轨迹。未匹配、含糊地点和失败响应保留此前行程。更新出发日时沿用已建立的回放锚点。首次从空行程生成时使用当前界面显示的历史参考日，允许用户明确修改。

## 访问与失败

首期 API 仅接收回环连接。运行方式见[后端说明](../../src/backend/README.md)。失败使用 `{"error":{"code","message"}}`。

| HTTP | 错误码 |
| --- | --- |
| 403 | `AI_LOCAL_ONLY` |
| 422 | `VALIDATION_FAILED`、`AI_INVALID_RESPONSE` |
| 429 | `AI_BUSY` |
| 502 | `AI_UNAVAILABLE` |
| 503 | `AI_NOT_CONFIGURED` |
| 504 | `AI_TIMEOUT` |

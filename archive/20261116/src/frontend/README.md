# RailFlow 前端（src/frontend/）

RailFlow 前端原型（Part I），覆盖车次查询、地图选站、登录与注册、乘车人管理、下单锁座、模拟支付、订单查询、取消、超时、退票，以及管理员车次管理、订单查询和操作记录。

## 运行

在项目根目录执行：

```powershell
java -m jdk.httpserver -p 8123 -d "$PWD\src\frontend"
```

打开 `http://127.0.0.1:8123/`。页面使用原生 ES Modules，需通过 HTTP 访问；该静态服务器由 JDK 18+ 自带（本机默认 `java` 为 21.0.10），仅用于本地预览。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面骨架与 SVG 图标集 |
| `styles.css` | 设计令牌、布局、组件与响应式样式 |
| `app.js` | 路由、视图、交互与状态编排 |
| `mock.js` | 本地 Mock 服务、种子数据、库存与业务规则 |
| `map-data.js` | 由 Natural Earth 轮廓生成的地图路径、站点坐标与线路 |

`mock.js` 对外暴露 `api`，页面只通过该接口读写数据。后续接入真实后端时，可保持方法签名并替换内部实现。

地图轮廓来自 Natural Earth 1:110m 公共领域数据，已预生成为 `map-data.js`。

## 与 Part III 的关系

本目录是 Part I 的前端原型，`mock.js` 在浏览器本地模拟数据与业务状态。Part III 将按 [REST 接口设计](../../docs/design/api.md)新增 Java 后端，并把 `mock.js` 的调用替换为真实接口；页面结构与交互保持不变（ADR-006：不引入前端框架、不增加构建步骤）。

## 演示账户

- 购票用户：`chen.yu@railflow.cn` / `railflow123`
- 管理员：`admin@railflow.cn` / `admin123`

登录弹窗提供“快速进入”入口。演示数据保存在 `localStorage`，访问 `http://127.0.0.1:8123/?reset=1` 可恢复初始数据。按住 Alt 点击“确认支付”或“确认退票”可查看失败状态。

需求依据见 [基本功能需求](../../docs/design/requirements.md)，开发方式见 [项目管理](../../docs/management/README.md)，智能体约束见 [AGENTS.md](../../AGENTS.md)。

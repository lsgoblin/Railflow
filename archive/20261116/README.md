# 2026-11-16 旧版设计与前后端归档

按用户指令保存原铁路购票项目的设计、前端和后端初始化工程。当前需求见 [design-spec.md](../../docs/design/design-spec.md)：AI 多轮个性化铁路行程与保存、主页实际铁路点亮，以及地图城市组线、历史时刻/票价参考规划和可调自然日停留；因预算不接入真实票务 API，余票暂不处理。

| 原位置 | 归档位置 | 文件数 |
| --- | --- | --- |
| `docs/design/` | [docs/design/](docs/design/README.md) | 60 |
| `src/frontend/` | [src/frontend/](src/frontend/README.md) | 6 |
| `src/backend/` | [src/backend/](src/backend/README.md) | 44（含 26 个被 Git 忽略的本地构建产物） |

先归档设计/前端 66 个文件，后补充后端 44 个文件，共 110 个原文件，迁移前后逐文件 SHA-256 一致。后端的源码、配置、SQL、测试与文档为 18 个文件；`target/` 中另有 26 个本地构建产物，继续被 Git 忽略，不纳入提交。

归档内的旧规则、接口、运行命令与历史状态不代表新版范围。内部设计链接按原目录结构解析；指向归档外文件或含原仓库路径的相对链接需结合原位置阅读，当前需求以 `docs/design/design-spec.md` 为准。

## 预览旧前端

在当前仓库根目录执行（JDK 18+）：

```powershell
java -m jdk.httpserver -p 8123 -d "$PWD\archive\20261116\src\frontend"
```

打开 `http://127.0.0.1:8123/`。这是依赖浏览器本地 Mock 的历史购票原型，未提供新版真实路径能力。归档前端 README 中的原运行目录不再是当前原型位置。

## 运行旧后端初始化工程

在当前仓库根目录执行（需要 Java 17、Maven 3.9+，默认 H2）：

```powershell
cd archive/20261116/src/backend
mvn spring-boot:run
```

旧健康检查为 `http://127.0.0.1:8080/api/health`。SQL 脚本仍在归档工程的 `src/main/resources/db/`。归档内 README 的 `cd src/backend` 是迁移前命令；当前以本节目录为准。本轮只校验原文件完整性，没有重新构建或启动后端。

任务台账、初始材料与 `PPT-final/` 保留原位置。归档未修改旧后端文件内容、未开通外部服务、未创建提交。

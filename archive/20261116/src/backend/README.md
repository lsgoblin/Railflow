# RailFlow 后端（src/backend/）

RailFlow 的 Spring Boot 后端工程，目标技术栈为 Java 17 + Spring Boot 3 + MyBatis + MySQL 8（历史 ADR-001、ADR-002）。当前保留代码初始化骨架：健康检查、统一错误体、H2/MySQL 双 profile、旧票务数据库基线与演示数据初始化。新版需求见 [design-spec.md](../../design-spec.md)，本工程尚未适配旅行规划与地图；[旧接口](../../archive/20261116/docs/design/api.md) 已归档，不再作为继续开发的默认依据。

## 环境

- JDK 17（本机 `C:\Program Files\Java\jdk-17`）
- Maven 3.9+
- MySQL 8（可选；默认使用 H2 内存库）

## 运行（默认 H2）

默认 profile 为 `h2`，启动时自动建表、写入站点，并初始化演示账户/乘车人/未来两天的车次：

```powershell
cd src/backend
mvn spring-boot:run
```

- 健康检查：<http://127.0.0.1:8080/api/health>
- 数据库检查：<http://127.0.0.1:8080/api/health/db>
- H2 控制台：<http://127.0.0.1:8080/h2-console>，JDBC URL `jdbc:h2:mem:railflow`

## 运行（MySQL）

先创建数据库并执行 [db/mysql/schema.sql](src/main/resources/db/mysql/schema.sql) 与 [db/mysql/data.sql](src/main/resources/db/mysql/data.sql)，再通过环境变量启动：

```powershell
$env:DB_URL = "jdbc:mysql://127.0.0.1:3306/railflow?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true"
$env:DB_USERNAME = "railflow"
$env:DB_PASSWORD = "********"
mvn spring-boot:run -Dspring-boot.run.profiles=mysql
```

连接串、账号和密码只走环境变量，不入库、不入 Git。MySQL 未就绪时应用仍可启动，但访问数据库接口会失败。

## 测试

```powershell
cd src/backend
mvn test
```

当前测试覆盖应用上下文、`/api/health` 与 `/api/health/db`。

## 目录

```text
src/backend/
├─ pom.xml
└─ src/
   ├─ main/
   │  ├─ java/com/railflow/
   │  │  ├─ RailFlowApplication.java
   │  │  ├─ common/       # 统一错误体与全局异常处理
   │  │  ├─ config/       # 密码编码、演示数据初始化
   │  │  └─ health/       # 健康检查
   │  └─ resources/
   │     ├─ application.yml
   │     ├─ application-h2.yml
   │     ├─ application-mysql.yml
   │     └─ db/           # H2 与 MySQL 的 schema/data 基线
   └─ test/java/com/railflow/HealthControllerTest.java
```

## 已初始化范围

- Maven 工程、Spring Boot 3.3.5、Java 17 编译目标。
- Web、Validation、MyBatis、MySQL/H2 驱动、BCrypt 依赖。
- 统一错误体 `{"error":{"code","message"}}` 与全局异常处理。
- 健康检查与数据库连通检查。
- `accounts / stations / passengers / train_runs / orders / operation_logs` 表基线；订单活跃唯一索引（生成列 + 唯一键）。
- 演示账户、乘车人、未来两天车次的初始化。
- H2 默认 profile 与 MySQL profile。

## 尚未实现

旧票务方向的认证/乘车人、车次查询、锁座/支付/退票、管理端与一句话查票均未实现。旅行规划、真实路径/地图、AI 偏好与最简模拟预订也未实现。原任务证据保留在 [台账](../../tasks/20261116-tasks.md)，后续按新版需求重新明确范围与契约，不直接沿旧票务工单推进。

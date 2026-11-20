# 带批注的参考文献

每条附 200–300 字批注，说明来源如何影响了具体的设计选择。

**1. Simon Brown, "The C4 Model for Software Architecture", https://c4model.com**

C4 主张架构图只为特定受众回答特定问题，用容器、组件两级缩放。本设计的图 01 取容器视图粒度：只画前端、后端、数据库与外部 LLM 四个执行单元及其通信，刻意省略类与模块，让评审者一眼看清单次部署要落地的部件；模块内部职责改用组件清单表表达，避免 C4 自己批评的「大泥球图」。汇报 PPT 的架构页与文档共用这张图，保证口头汇报与书面文档一致；它也约束了本设计不追求「一张图画全系统」。

**2. Martin Fowler, "PresentationDomainDataLayering", martinfowler.com, 2022**

Fowler 论证表现层、领域层、数据层的职责与依赖方向，主张领域逻辑不感知数据访问细节。本设计把十条业务规则集中放在应用服务与领域层，Controller 只做参数与会话处理、MyBatis Mapper 只做存取。直接收益是：AI 查询助手作为新增的外层能力，可以调用既有 TrainQueryService 而不触碰规则实现；Part III 若替换持久化或增加接口形态，领域层不动。ADR-006（不重写前端）与分层决策同源于此文的演进式架构思想。

**3. Spring Team, "Spring Boot Reference Documentation", spring.io**

官方参考文档界定了 Spring Boot 3 对事务、调度、数据访问与安全的支持边界，本项目三条核心机制直接对应：服务层方法事务保证「扣库存 + 建订单 + 写操作记录」原子提交（规则 5）；@Scheduled 每 30 秒扫描到期订单实现超时失效（规则 3）；BCrypt 密码哈希与会话鉴权支撑演示级安全（规则 10）。文档对「约定优于配置」的取舍也影响了我们放弃自研微框架、选择 Spring 全家桶的决策（ADR-001）。

**4. MyBatis Team, "MyBatis 3 User Guide", mybatis.org/mybatis-3**

MyBatis 保持 SQL 显式、映射最小化的理念。本设计最关键的并发正确性来自一条可审查的单语句原子更新（ADR-003）：带「余票大于零」条件的 UPDATE 把锁座一次做完，影响行数为 0 即拒绝下单。选择 MyBatis 而非 ORM 自动生成 SQL，正是因为超卖防护必须逐字审 SQL；该指南的动态 SQL 也用于车次查询的索引规划（出发站、到达站、日期），让「查询不占库存」在 SQL 层可见可测。映射文件与 schema.sql 一一对应，种子数据可直接复核。

**5. OpenAI, "Function calling / Structured outputs", platform.openai.com**

该指南给出让 LLM 按预定义 JSON Schema 返回结构化结果的标准做法，是 FR-AI-1「一句话查票」的实现基础：系统提示约束模型只抽取出发站、到达站、日期三个槽位并输出可校验 JSON，而非自由对话。受其启发，我们把站名白名单与「相对日期以服务端时间解析」放在本地校验，不指望模型自觉，形成「模型抽槽、代码把关」的责任切分（architecture §7）。这一来源也支撑了「不做自由客服」的裁剪：脱离结构化约束的对话无法保证业务事实正确。

**6. Alex Xu, *System Design Interview – An Insider's Guide, Volume 1* (ByteByteGo, 2020)**

该书对库存超卖、幂等与定时对账给出模式化讲解。本设计沿用其「单库场景下数据库原子扣减优先于分布式锁」的结论（ADR-003），并采纳其幂等思路：所有状态迁移都用「UPDATE ... WHERE status = 期望前置状态」实现，重复支付、重复退款、重复超时处理天然失效（规则 6、8）。书中「先按量级选方案再谈扩展」的框架也与 ADR-004 一致——本项目订单量级小，轮询扫描优于延迟队列，性能余量留给 Part III 的并发 PoC 去实证。

# Annotated References

Sihan Li | 2453202 | Date accessed: 2026-11-17

Official technical documentation and upstream primary descriptions form the basis of this list. Each annotation runs 200–300 words and focuses on the effect on this project's design and on the applicable boundaries; conclusions about the project's local samples are not replaced by the literature. A reachable page does not mean that account permissions, data import, or real integration have been verified.

<a id="ref-c4"></a>

## 1. Simon Brown. C4 Model: Container Diagram

Source: [Simon Brown. C4 Model: Container Diagram](https://c4model.com/diagrams/container). Accessed: 2026-11-17.

The source explains system boundaries, technology choices, and communication relationships through containers such as applications and data stores, and it delegates deployment information to a separate view. The project adopted this presentation for two architecture figures. The first figure is a container view that presents only the responsibilities of the browser, the monolithic backend, the database, the fixed data package, and the external services, while the internal modules are expanded in the tables of the architecture document instead of being crowded into the picture. The second figure carries the deployment information on its own and sets out the nodes, the same-origin access path, and the credential boundary. Keeping the two views apart means that a course reviewer can first judge whether the system is complete and then inspect the module interfaces, instead of reading business classes, machines, and pages mixed in one diagram. The design borrows the method of expression and does not copy the examples, and it keeps the monolithic scale of the system. The boundary is that a container diagram communicates structure; it is neither an interface contract nor deployment evidence, a drawn connection does not prove that a service has been deployed, and the figures stay valid only while they are checked against the domain model and the actual runtime evidence. The text and the connectors of each figure also need checking before submission.

<a id="ref-spring"></a>

## 2. Spring Team. Spring Boot 3.5 Reference / System Requirements

Source: [Spring Team. Spring Boot 3.5 Reference / System Requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html). Accessed: 2026-11-17.

The official reference documentation for Spring Boot 3.5 is used to check the application framework and runtime conditions that the project retains, and it supplies the technical basis for the monolithic backend, the same-origin static pages, and external configuration. The project continues on the established Java 17 and Spring Boot 3 lines; consulting a newer branch of the reference serves as a check and is not a reason to upgrade the build. The framework covers request handling, configuration, and application assembly, while planning, date replay, and railway geometry stay defined by the domain services, and framework defaults are not treated as business correctness. The design therefore writes the module boundaries and the transaction scope out explicitly, and puts certificates, sessions, and deployment configuration on the implementation verification list. A mature framework reduces the cost of environment assembly, but the exact dependency versions, their compatibility, and an actual startup still need confirmation from build and run records, and the deployment parameters continue to follow the demonstration environment in use. The source states the framework's system and runtime requirements, not the behavior of this system: it cannot be cited as evidence that the application starts, that the configuration is complete, or that the selected versions remain compatible; those items still need confirmation from the build and from the local run.

<a id="ref-mybatis"></a>

## 3. MyBatis Team. MyBatis 3 Introduction

Source: [MyBatis Team. MyBatis 3 Introduction](https://mybatis.org/mybatis-3/). Accessed: 2026-11-17.

The official introduction establishes what MyBatis provides for custom SQL and relational mapping. That capability fits the query pattern of this project, which reads stop times, segments, and service days by dataset version, and it lets the owner and dataset-version conditions of an itinerary be reviewed directly in the statement. Rather than adding a general persistence abstraction at course scale, the design keeps the existing tool and carries queries and snapshot writes through parameter binding, explicit indexes, and short transactions. What the framework reduces is mapping work; it does not on its own guarantee concurrency safety. Save conflicts, request deduplication, and reads across users still have to be handled jointly by model constraints and the database, so the division between the two layers is written out rather than left to the mapper. Later work should inspect the actual SQL and execution plans before deciding whether preprocessing or query optimization is needed, instead of inferring performance from the framework name. The document describes mapping capability, not the behavior of this schema: it does not show that an index is used, that a transaction stays short, or that a conflict is detected, and those points rest on the table design, the statements, and the concurrency tests.

<a id="ref-mysql"></a>

## 4. Oracle. MySQL 8.0 Reference Manual: InnoDB Transaction Model

Source: [Oracle. MySQL 8.0 Reference Manual: InnoDB Transaction Model](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html). Accessed: 2026-11-17.

The chapter explains the role of multi-versioning and row-level locking in the InnoDB transaction model and provides the basis for the consistency design in a shared database. On that basis, the project confines a snapshot save to a short transaction and requires an update to check the user, the plan, and the expected version together; an ordinary read does not by itself stop another window from overwriting the same row, so the version condition has to be present explicitly in the statement. The unique identity of a request and the verification of its result handle the case in which a write succeeded but the response was lost, a case that cannot be covered by disabling a button in the interface. Here the database capability is applied to itinerary and simulation snapshots; the earlier inventory-deduction scope is not restored by the citation. The source supports the choice of mechanism only. The concrete table structure, the isolation behavior, the conflict errors, and failure recovery still need concurrent and timeout tests on the selected version, and the manual describes the general behavior of the engine rather than the correctness or the performance of these particular statements; a mechanism that the engine provides is not proof that the application uses it correctly.

<a id="ref-gtfs"></a>

## 5. MobilityData. General Transit Feed Specification: Schedule Reference

Source: [MobilityData. General Transit Feed Specification: Schedule Reference](https://gtfs.org/documentation/schedule/reference/). Accessed: 2026-11-17.

The specification defines the relations among stations, trips, stop times, service calendars, and shapes, and it states that a service day may carry times beyond twenty-four hours. That reading directly shapes the model in which this project separates the reference service day of a train, the boarding date on the way, and the user's itinerary date, so that accumulated times are not truncated into an ordinary clock hour. Shapes are linked through the trip and then clipped to the travelled segment; whether the optional distance field exists and in which unit has to be checked package by package, and a stop sequence number cannot be used as an index into the shape array. The project keeps replay anchors under a uniform calendar-day offset, which is an application design derived from the semantics of the specification, not a travel-planning algorithm that the specification provides. The boundary is that the reference defines fields and relations, not the quality of a particular feed: the completeness of a railway package, the accuracy of its coordinates, and the actual alignment of its shapes must be verified separately, and a valid file structure does not show that a train operates on a given date or that a selected segment has usable geometry.

<a id="ref-data"></a>

## 6. wensimehrp. chinese-railway-gtfs: Project Description and Data Conventions

Source: [wensimehrp. chinese-railway-gtfs: Project Description and Data Conventions](https://github.com/wensimehrp/chinese-railway-gtfs). Accessed: 2026-11-17.

The upstream description lists the scope of the data: railway lines, station coordinates, and train timetables. It states explicitly that fares are not included, and it identifies WGS84 coordinates together with the license sources of the data. This lets the project use a fixed GTFS package as the input for times and for the shapes linked to each trip, while leaving historical segment fares and city attribution to an independent source, so that no fare is generated from a package that carries no price. The initial data test fixes a version instead of following the upstream daily update, and records the download source, the content hash, the applicable dates, and the necessary attribution, so that an old itinerary can be re-checked later. The repository description does not guarantee that a target train runs every day or that each shape is accurate, so the design keeps per-train calendars, segment clipping, and coordinate checks. The source supports the reason for choosing this data source; it does not replace the local import or the map-sample verification, and the conventions it states describe coverage and provenance rather than completeness. The license sources named in the description remain part of the recorded use, and the necessary attribution stays attached to the data.

<a id="ref-amap"></a>

## 7. Amap Open Platform. Web Service API: Place Search Documentation

Source: [Amap Open Platform. Web Service API: Place Search Documentation](https://lbs.amap.com/api/webservice/guide/api/search/). Accessed: 2026-11-17.

The official place-search documentation describes keyword lookup of places and the interface through which a service credential is used. It supports the division of labor adopted in this project: local cities and railway stations are held locally, other places are queried on demand, and no complete place database is built. The points of interest returned by the interface serve disambiguation and positioning; they cannot become railway station codes, train timetables, or running geometry, and an ordinary place has to be linked to a known railway entity before it enters an itinerary. The design also keeps Web service credentials on the backend and treats the browser basemap and place search as separate dependencies, with their failures and their coordinates handled independently. Documented capability does not mean that the account already holds the permission or a sufficient quota: the basemap was integrated on 2026-11-19 and the alignment of three sample train runs was checked, while the version, the quota, the storage of references, and the long-term stability of the POI service still need checking before integration, and no keyed query was issued during this review. The document describes the interface, not the account: it cannot establish that a request succeeds, that a returned place is correct, or that the service stays available.

<a id="ref-openai"></a>

## 8. OpenAI. Structured Model Outputs

Source: [OpenAI. Structured Model Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Accessed: 2026-11-17.

The official guide describes returning model results in a predefined structure and discusses how refusals and incomplete outputs are handled. This shaped the project's treatment of a natural-language revision as a versioned, constrained proposal: the proposal carries the itinerary version it was produced against, the complete result is first validated for structure, entities, and allowed fields, then checked by the deterministic planning service, and only then applied to the shared itinerary by the application, so the model itself holds no write authority. A structurally valid proposal still has to pass the domain checks, or it is rejected, because structural matching constrains the shape only and cannot guarantee that a station, a fare, or a time is real; tool facts, user conditions, and model suggestions are therefore stored separately. A third-party interface that is compatible with the OpenAI form does not automatically carry the same constraint capability, and refusals, truncation, and invalid returns have to be tested with each provider. The source supports the boundary of controlled orchestration: the model proposes, the deterministic services verify, and the user confirms. It justified neither an additional agent framework nor letting the model save, book, or execute transactions on its own, and a schema match is not evidence that an AI feature is implemented or verified.

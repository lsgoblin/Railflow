# Updated Requirements and Scope Evolution

Sihan Li | 2453202 | CD-20261119

## 1. Current Problem and Goals

RailFlow helps users organize the order of city visits, railway travel conditions, and natural-language preferences into reference itineraries. The map, the conversation, and the result list share one plan; recommendations rest on sourced historical timetables and actual railway geometry, and do not represent current sellability.

Participants include visitors and planning users, signed-in users who save itineraries, and the railway data source, place service, and LLM on which the system depends for data or capability. The current scope does not restore ticketing administrator, inventory maintenance, or payment roles. Selecting a city on the map and AI are the two entry points of the complete product; what is implemented now is this round's MVP interface (historical replay of direct service on the same train), while map-label clicks, multi-round AI rerouting, and account saving remain within the complete product scope and are not yet implemented.

## 2. Core Requirements and Traceable Acceptance

The table covers the main use cases used by the course models; FR numbers follow the current project feature list, and several requirements can be realized through the same interaction model.

| Use case | Requirement IDs | Rules and decidable outcomes | Corresponding design |
| --- | --- | --- | --- |
| UC-01 Route building and historical planning | FR-LOC-01–07, FR-EDIT-01–06, FR-DATA-01–04, FR-PLAN-01–07 | Keep the city order and the specific stations; default to a calendar-day stay; a fixed dataset version, per-train calendars, and complete times that cross midnight; once constraints are met, prefer the fewest transfers, and segments within the same train run instance add no extra count; this round matches direct service on the same train only | Place and planning services, domain diagram, planning sequence, and date model |
| UC-02 Multi-round AI | FR-AI-01–07 | Understand preferences, ask follow-up questions, and allow regional suggestions to be revised; "pass through Zhengzhou" inherits the valid conditions, and a validated result updates the same itinerary; an older response does not overwrite a newer edit | AI orchestration, modification sequence, and revision |
| UC-03 Save and restore | FR-SAVE-01–06, FR-AUTH-01–03 | A complete save includes intent, explanation, source, and anchors; it has per-owner isolation, conflict handling, and verification of an unknown write; a local draft is not the same as account saving | Conditional writes, snapshots, and the restore model |
| UC-04 Route and comparison | FR-RESULT-01–04, FR-GEO-01–04 | Selecting a candidate links the corresponding segment; actual railway geometry matches the selected train run and travelled boundaries; a missing track is not filled with a straight line; an unknown price is not summed as zero | Geometry service, UI and UX |
| UC-05 Simulated record | FR-SIM-01–03 | On user confirmation, save a simulated snapshot, deduplicate the same request, and create no real ticket, payment, or inventory hold | SimulationRecord, user flow |
| UC-06 Exceptions and accessibility | FR-UX-01–03 | An error does not clear input; the interface is operable by keyboard and input method; no critical action is lost on a narrow screen; geometry, timetable, and fare are each explained separately | Component states and recovery actions |

Transfers have no fixed product limit, but technical search still needs bounded-resource protection. An incomplete budget, uncovered dates, no match, and a service failure are different outcomes; performance cannot be met by truncating the number of cities or transfers at a fixed value.

The initial railway data test fixes `gtfs-20261116-085531` and uses the associations among stops, trips, stop_times, calendar_dates, shapes, and feed_info; this follows an existing requirement. The package was imported whole on 2026-11-18 and passed validation and activation (4,778,140 rows), and the segment track geometry integration uses the same version and hash. A successful import means only that version registration and exception classification are complete: the 193 source time records in the fixed package whose arrival is later than departure are kept at their original values with a public warning, and do not mean that all times are correct. The primary GTFS source contains no fares; independent historical fares and city attribution still need to be supplied. The dataset reference date and the itinerary date are connected by the uniform calendar-day offset of the fixed D0/R0; restore does not change the anchors.

<a id="scope-boundary"></a>

## 2.1 Course-Scope Layering and Exit Conditions

The course draft retains the complete product design, but submission and acceptance look at one closed loop only. The table classifies existing features as this round's core, necessary support, and later extension, to judge when extension may stop; complete product requirements continue as the later direction and are not deleted by this layering.

| Layer | Content | Corresponding features and use cases | Basis for judgment |
| --- | --- | --- | --- |
| Core loop of this round | Whole-package import of the fixed GTFS with version traceability, queries for direct service on the same train, clipping of the actual railway track geometry for the segment between any two stations and its overlay on a real basemap, and the input and result states for station selection and reference service day | FR-DATA-01/02/04, FR-PLAN-06/07, FR-GEO-01/02/03/04, FR-LOC-01/03, FR-EDIT-03/04, FR-RESULT-01/02, FR-UX-01; the direct subset of UC-01 and UC-04 | [Feature List §2](../feature-list.md#mvp) marks 16 features as "yes", and all of them carry acceptance requirements for this round; in the "implementation scope" column of the feature list, 5 are core for this round and 11 are necessary support, and together they form the same acceptance loop |
| Necessary support | The fixed package and its content hash, MySQL 8 and migrations, same-origin deployment, and basemap credentials; these do not form a delivery feature on their own | Deployment view and import and activation rules | If any one is missing, the core loop cannot be judged as passing, but none of them counts separately among the 16 items |
| Later extension | Multi-round AI rerouting, account save and restore, historical fares, transfers and connections, city attribution completion, external POI, map-based route building, and simulated records | FR-AI, FR-SAVE, FR-AUTH, FR-SIM, and the remaining FRs; UC-02/03/05 | 38 features in the feature list marked "no" are not scheduled or accepted this round |

**Acceptance scenarios for the core loop**

- Success (clipping and track geometry): Beijing South (VNP) → Nanjing South (NKH), reference service day 2026-11-16 → the interface returns the list of direct services on the same train → select G531 (13 stops in total, segment seq 1 → 10) → the stop table shows the complete departure and arrival times → the basemap draws only the actual track geometry of this segment (700 points) and does not extend to Wuxi East or Shanghai Hongqiao.
- Success (cross-day): Beijing (BJP) → Harbin (HBB) → select T297 → arrival at 26:06, displayed as 02:06 on the next day with `+1 day`, and later stops accumulate to 31:18, which proves that times beyond 24 hours are not truncated.
- Failure: select Beijing (BJP) → Harbin (HBB) → select K339 → the train run has no shape, so the interface shows the reason for the missing shape (reason code `NO_SHAPE`), the map draws no polyline, the selected stations and the text results are retained, and the user can choose another train; a straight line or the whole route must not stand in for it.

**Dependencies and stop conditions**: The core loop depends on the fixed package being available and containing shape data, and on usable basemap credentials (a basemap failure degrades to an offline canvas and does not count as a pass). Extension stops after the 16 items pass independent review and user acceptance; smooth PoC or integration work is not a basis for widening the scope, and new capabilities return to the user for confirmation.

## 3. Changes Relative to Part I and the Presentation Version

| Change | Before | Now | Reason and design impact |
| --- | --- | --- | --- |
| C12/C15 main task and entry point | Station-to-station ticket search and transaction operations | Map-based city route building and AI railway itinerary planning | The user emphasized route organization and actual railway lines; the core model shifts to plans, visit nodes, and candidates |
| C18 Stay | A single ride or an order time | A user visit node continues by default on the next calendar day | A multi-city itinerary needs explainable date propagation; the stay is not counted as a full 24 hours |
| C19–C21 AI and saving | Three-slot prefill with independent parsing per request | Multi-round preferences, follow-up questions, regional suggestions, and save and restore | Supports continuous revision; adds context source, version consistency, and owner checks |
| C22 Actual railway lines | Map station positioning and prototype schematic lines | Actual railway segment geometry associated with a train run | The line itself becomes core acceptance; clipping, coordinate conversion, and verification against real samples are required |
| C23 Ordering | A single-segment list of train runs | Under user constraints, prefer the itinerary with the fewest train transfers | Avoids reading "shortest" as distance or duration; the secondary rule for equal transfer counts is still undetermined |
| C24–C26 Historical data | Old simulated seat-availability data and transaction rules | Historical timetables and fares as reference, with remaining seats neither queried nor simulated for now | A data budget limit; an unknown price is stated explicitly, and no promise is made that a service currently operates or is available for sale |
| C27 Place division of labor | Prototype station data | Local cities and railway stations, with Amap queried on demand for other places | Avoids building a full POI database; external place identity and railway identity stay separate |
| C28–C30 GTFS and replay | Demonstration seed train runs | A fixed multi-day GTFS package, associated shapes, and a uniform day offset | Improves source traceability; adds operating calendars, cross-midnight times, versions, and geometry handling |
| Current transaction scope | Seat locking, simulated payment, cancellation, timeout, refund, and the admin console | Only the accompanying simulated confirmation and record | Concentrates implementation on planning and the map; the old business state machine does not carry over automatically |

The classroom presentation has been completed, and its script keeps the ticketing version of that time. The refactoring responds first to the teacher's comment that the scope was too large; the specific city route building, multi-round AI, historical data, and budget boundary were confirmed later by the author, and not all details can be attributed to the teacher.

<a id="teacher-feedback"></a>

### 3.1 Teacher Feedback and Adoption Record

The feedback comes from the author's relay on 2026-11-17: the scope of the previously archived project was too large and unrealistic, and the revision needed to focus on a single point of the whole system, for example the original system's distinctive map-based ticket search; the author therefore carried out this round of refactoring.

| Comment or later decision | Response and rationale | Affected design | Review criterion |
| --- | --- | --- | --- |
| The original system scope was too large and unrealistic | Exit the full inventory, payment, cancellation/timeout/refund, and admin console flows, and take railway queries and map lines as the entry point for the refactoring | Summary, product boundaries, architecture responsibilities, domain model, and validation plan | Check whether the current scope still contains too many independent delivery goals; renaming the project alone does not count as convergence |
| Focus on one distinctive point; map-based ticket search is an example | Form a shared flow from city and station input, historical candidates, and line display; map-based ticket search is the teacher's example and is not written as the only specified option | Planning and geometry services, UC-01/UC-04, and the main UI flow | Check the boundaries of the core loop, the supporting capabilities, and later extension, and accept per the MVP mark in the feature list |
| Specific requirements added later by the author | Multi-round AI, saving, POI, and historical fares keep their descriptions as confirmed requirements | Other use cases, modules, open issues, and the PoC | Whether these are necessary for the core and whether they should be deferred is identified by the scope review; confirmed requirements are not deleted or changed unilaterally |

## 4. Quality Requirements and Current Implementation Boundaries

Quality priorities run in order: factual correctness and state consistency, security and recoverability, explainability, and responsiveness under limited resources. An invalid entity, a stale-version result, a cross-user reference, or a zero-filled unknown price cannot pass; when AI or POI lookup fails, the manual planning input is retained. Desktop 1440×900, mobile widths of 390 and 320, and 200% zoom are used for layout checks, and primary actions are reachable by keyboard; these are acceptance goals and do not mean that all devices have been verified.

The current implementation covers the core loop defined in this section: whole-package import of the fixed package with version traceability, direct service on the same train with stop details, segment track geometry overlaid on a real basemap, and the same-origin frontend served by Spring Boot; the 16 items have passed independent review and item-by-item user acceptance. AI, sign-in and server-side saving, simulated records, historical fares, and Amap lookups of other places remain deferred, and cannot be inferred as connected from implemented pages. Cross-browser and real-device checks, concurrency stress, and a full re-import have not been tested and are not written as passed.

## 5. Requirements Still Requiring Adjudication

Cross-station connections and the minimum connection buffer, a zero-day stay, the secondary ordering rule for equal transfer counts, the search window when no connection is possible, necessary inputs such as seat class and passenger count, the default origin, guest and cross-device saving, the retention period, and long-term preferences still need confirmation. This draft does not fill in arbitrary minutes, days, or fare priorities to manufacture completeness.

Detailed methods and unresolved validation appear in [Design Models](design-models.md) and [Open Issues, Risks and Validation](open-issues-risks.md); the course submission may retain these explicitly unresolved items and must not write them as implemented rules.

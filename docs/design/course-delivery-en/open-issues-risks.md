# Open Issues, Risks and Validation

Sihan Li | 2453202 | CD-20261119

## 1. Unresolved Design Items

| Issue | Impact | Current handling and required basis |
| --- | --- | --- |
| Source of historical segment and seat-class fares | Price and budget explanation | The primary GTFS source contains no fares, and a missing value stays unknown; independent sources, versions, segments, and seat classes still need verification |
| City attribution and station coordinate completion | Automatic station selection and geometry positioning | Build a sourced mapping; do not truncate a station name or replace a station with the city center |
| Cross-station connection, minimum buffer, and zero-day stay | Onward journey feasibility | Do not mark unverified connections as feasible; set the parameters only after the user confirms the rules |
| Secondary ordering at equal transfer counts and the candidate search window | Recommendation stability and computation volume | The primary ordering confirms only the minimum transfer count; price or duration priority and a fixed transfer cap are not added without authorization |
| Necessary fields such as seat class and passenger count | Price and query conditions | Defined by capability configuration; no default value is set silently while a field is undefined |
| Save scope, retention period, and long-term preferences | Identity, restore, and data lifecycle | The account owner rule is kept; guest use, cross-device use, retention periods, and cross-itinerary memory await confirmation |
| Map SDK and place API versions and quotas | Projection, hit accuracy, cost, and availability | The Amap basemap is connected and the alignment of three sample sets has been checked; domain allow-lists, quotas, and long-term stability are unverified. An external general place API is still not connected, and unlimited free calls are not promised |
| Source version retention and replacement | Restoring old itineraries | Save the data identity and anchors; replacing a version requires recomputation, and permanent replay is not promised before a deletion policy is settled |
| Teacher guidance and scope focus | Final submission and course consistency | The [§2.1 scope layering in the requirements](requirements-update.md#scope-boundary) already sets out the core loop, necessary support, and later extensions with exit conditions; the 16 core items passed independent review and user acceptance on 11-19. The complete product design is kept as a later direction and is not required in this round |

## 2. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A shape exists but disagrees with the actual segment | The map gives a wrong travel basis | Check station order, direction, and railway alignment sample by sample, and leave ambiguity empty |
| Service day, boarding day, and calendar day are confused | Later boarding dates are wrong | Accumulated times plus a fixed day offset; the baseline cases cover cross-day and leap day |
| Many user nodes and combinatorial candidate expansion | Runaway response time or memory growth | Bounded computation, preprocessed indexes, cancellation, and an explainable incomplete status; nodes are not deleted implicitly |
| AI fabricates stations or fares, or overwrites manual edits | Wrong facts and state conflicts | Allowed fields, entity and Schema validation, separated tool facts, baseRevision check |
| Save timeout and cross-window concurrency | Duplicate records or lost updates | Short transactions, version conditions, unique request identity, result verification |
| Missing data licensing, source attribution, or coordinates | Sources cannot be traced, and the map is offset | Fix the version, hash, attribution, and original coordinates, and convert only once; verify the applicable licence conditions in practice |
| POI/LLM quota exhaustion or network failure | One function becomes unavailable | Bounded calls, independent errors and a manual path; input is not cleared |
| Prototype screenshots are confused with real capability | Review takes fixtures as data evidence | State the source of every sample consistently, keep the not-yet-connected status, and list real acceptance separately |

## 3. Part III PoCs and Pass Criteria

Everything below is a plan and is not written as an executed result; performance thresholds, call budgets, and unresolved business parameters are confirmed before the trial, and this table first defines repeatable inputs, observations, and correctness criteria. The exceptions are P01 and P02, already executed with the MVP implementation of 2026-11-18/19, and the cross-day time display of P03, for which evidence also exists; the conclusions appear at the end of this section, the original criteria are kept for re-checking, and the remaining items are still plans to be executed.

| ID and design under test | Method and observations | Pass criteria |
| --- | --- | --- |
| P01 Fixed data import | Fixed GTFS package, hash, calendar and foreign-key checks; record valid and missing records and the import duration | Every segment of the target sample is traceable to a train run instance of the same version; missing data has an explicit result, and a static check is not written as nationwide coverage |
| P02 Real geometry and clipping | Requirement candidates G7179 and G531, plus T297; check validity dates, actual segments, track direction, and coordinates | No track is drawn outside the travelled segment, and no gap is filled with roads or straight lines; each segment is compared manually against reliable railway alignment, with the evidence saved |
| P03 Dates and replay | 0 and non-zero offsets, 26:06/56:20, month and year crossing and leap day, calendar exceptions, and coverage boundaries | The full reference and itinerary times match the manual baseline exactly; calendar-day stays and restore anchors do not drift |
| P04 Search and transfers | Compare planning results on a small exhaustively enumerable benchmark graph; includes same-station change of train, segmenting one instance, explicit via constraints, and long city sequences | When the constraints are satisfiable, the transfer primary ordering returned is correct; budget exhaustion is marked incomplete and not used as "no route"; P50/P95, expansion count, and memory are recorded |
| P05 Multi-turn and asynchronous | Append Zhengzhou, delete a suggested city, change the date manually while waiting; inject late, duplicate, and truncated results | Explicit conditions are kept and a patch is applied only once; an old result cannot overwrite a newer revision; AI, map, and list stay consistent |
| P06 AI guardrails | Illegal entities, extra fields, arbitrary URL/SQL, refusal, timeout, and prompt injection | No unknown tool is executed, no half-applied change is submitted, and no fabricated fare or promise of availability for sale is produced; manual input is kept |
| P07 Saving and ownership | Saving in the same window and across windows, access by users A and B, expired identity, response loss after a successful write | Users are isolated; a version conflict does not overwrite; the same requestId returns the original result, and a newer draft stays dirty |
| P08 UI and degradation | Multiple desktop engines, physical phones, IME, keyboard, 200% zoom, basemap/POI/AI failures | Key actions are reachable, input is not lost, and the actual source attribution is visible; fixtures prove interface states only |
| P09 Historical prices | Samples with complete fares, partially unknown fares, and different versions, segments, and seat classes | A zero fare is not used as padding and full-route prices are not subtracted; sources are traceable, and an incomplete price is not called a satisfied budget |

Actual results for P01 and P02 (2026-11-19): the fixed package was imported in full and activated, parsing of the nine files and version traceability are available, and importing the same version again returns NOOP without regenerating data; the segment track geometry of the three samples G7179, G531, and T297 was checked segment by segment on the real basemap and passed, with endpoint distances independently recomputed by Haversine (G7179 first and last points 61.1/112.7 m, G531 140.5/42.7 m, T297 17.5/1.0 m), G531 staying within Nanjing South and T297 within Harbin, while a missing shape and a boundary ambiguity return `NO_SHAPE` and `BOUNDARY_AMBIGUOUS` respectively without filling in a straight line. The user performed the visual check of the real railway alignment on the local basemap. P01 and P02 therefore pass; the cross-day time display of P03 is verified (T297 26:06 → 02:06 the next day, +1 day), but the D0/R0 offset, leap day, and calendar exceptions remain to be executed. P03–P09 are deferred with the complete product.

Each item records fixed inputs, devices, software and data version, expected and actual results, logs or screenshots, duration, and uncovered items. A failure keeps the original symptom, and the fix and regression are recorded afterwards; independent review draws conclusions from this evidence and cannot be self-approved by an implementer who rewrites the criteria.

## 4. Priority and Dependencies

Execute P01–P03 first to confirm that the target data and geometry are usable, then the search in P04 and the AI coupling in P05/P06; model autonomy is not widened without reliable tool facts. Saving and identity depend on a reviewed contract and real services; device and interface validation can proceed independently. The historical trade oversell and refund PoCs are no longer default acceptance within the current planning scope. This round's MVP has executed P01 and P02 and additionally has cross-day display evidence; the remaining P03 items and the AI- and saving-related PoCs are deferred with the complete product.

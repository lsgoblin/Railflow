# RailFlow Course Design Delivery

Author: Sihan Li (student ID 2453202, single-author project) | Systems Analysis and Design, Assignment 2 (Part II: Design) | Version CD-20261119 | Final candidate for submission, 2026-11-20

This directory holds the design artifacts for Assignment 2: nine main documents corresponding to the nine artifact categories in Section 3 of the assignment brief, plus six design figures (PNG and editable SVG) four screenshots of the implemented MVP and three target-state prototypes. Read them in the following order.

| Course artifact | File | Delivered content |
| --- | --- | --- |
| Design Summary | [design-summary.md](design-summary.md) | About 500 words on the change in positioning, the reasons and the current status, including the 11-19 implementation results |
| Architecture and Key Decisions | [architecture.md](architecture.md) | Three views, the rationale for decisions T01–T09 (including product AI model selection), quality attributes, and the roles/tools/states/orchestration/guardrails of the product AI plus the draft snapshot protocol |
| Design Models | [design-models.md](design-models.md) | Domain relationships, planning and multi-turn interaction, save states, internal service operations, and the use-case realization for import and segment track geometry |
| Updated Requirements | [requirements-update.md](requirements-update.md) | Six use-case categories, FR traceability, course-scope layering and exit conditions, and the changes and rationale relative to Part I and the presentation version |
| UI and UX Design | [ui-ux.md](ui-ux.md) | Shared user flows, live screenshots of the core result states, target-state prototypes, states and recovery, and device boundaries |
| Open Issues, Risks and Validation | [open-issues-risks.md](open-issues-risks.md) | Risks, mitigations, and the PoC method and pass criteria for P01–P09 (P01/P02 executed) |
| Reflection on AI Tool Use | [ai-tools-reflection.md](ai-tools-reflection.md) | Actual contributions, limitations, failure corrections, and human verification methods |
| Annotated References | [references.md](references.md) | Eight official/upstream sources, each with a 200–300 word annotation |
| Team Member Contributions | [team-contributions.md](team-contributions.md) | Name/student ID/team size, and responsibilities for analysis, modeling, design, decisions, and implementation acceptance |

Figures used in the main documents are listed in [figures/](figures/README.md); prototype screenshots and source notes are listed in [images/](images/README.md). The images used by the nine documents and their cross-references all stay within this directory; the only external references are [feature list](../feature-list.md) and [MVP contract](../mvp-contract.md) in the project repository, which are not part of this package.

## Current Status

- **Implemented and accepted item by item**: the 16 MVP items — whole-package import of a fixed GTFS package (about 4.78 million rows), direct service on the same train, clipping the real track geometry of the segment between any two stations and overlaying it on a real basemap, and same-origin frontend hosting under Spring Boot.
- **Not yet verified**: cross-browser behavior and physical mobile devices, concurrency pressure, and full re-import.
- **Still design only (not implemented)**: multi-turn product AI, account save and restore, historical fares, transfer connections, external POI, and route building by selecting points on the map.

## Scope Boundaries

- The authoritative version of the full product requirements is maintained in the project repository; this package submits only the design artifacts and the necessary supporting basis. Links to ../feature-list.md and ../mvp-contract.md point into that repository and do not resolve inside this package; each document restates the conclusions it relies on.
- The slides used for the class presentation are the ticketing-version script of that time; their scope differs from this version, and they are not submitted with this package.
- The figures express the target design; the numbers and status are governed by the nine body documents, not by the figures. The scope and gaps of runtime verification are stated in each document.

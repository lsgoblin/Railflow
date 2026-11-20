# Reflection on AI Tool Use

Sihan Li | 2453202 | CD-20261119

## 1. Actual Use and Outputs

The project used AI coding and design assistants to support requirements discussion, option comparison, frontend drafting, documentation organization, and checking. The human author set the goals and confirmed scope and trade-offs; AI output had to be checked back against repository material and actual evidence. The LLM that the product will call at runtime is a designed runtime capability, separate from the development assistance tools in this section.

| Stage | Actual AI assistance | Role of the human and evidence |
| --- | --- | --- |
| Requirements evolution | Organized the map city groups and lines, calendar-day stay, multi-turn AI, historical data, and deferred seat-availability rules | The user initiated the refactor after the teacher's advice that "the original scope was too large and should focus on distinctive points", then confirmed the specific positioning and budget; whether these added capabilities are still too many awaits review, and unresolved rules are not filled in by tools |
| Course gap assessment | Compared the nine deliverable categories in the assignment brief with the current and archived designs | Read the brief and the files directly, distinguishing "an old file exists" from "applies to the current version" |
| Frontend sample drafting | Generated native modules, a single store, map adaptation, fixtures, and error interactions | Existing development self-test records list the scope and the uncovered items; this interface version was then narrowed to the MVP, and AI, account saving, multi-city editing, and multi-option comparison are no longer mounted |
| Implementation and integration | Generated data import, direct-service query, track clipping, and frontend state code against the contracts, and supported defect fixes | Real package import, the three sample sets, exception paths, and basemap recovery were reproduced by an independent review that did not write them; cross-browser and real-device testing were not performed |
| Documentation collaboration | Restructured the collaboration role rules, the document division, specification paths, and the feature list | Retained the historical text, and checked links, numbering, content cross-references, and the shared workspace |
| Course materials for this round | Drafted the new architecture, models, risks, references, and editable figures | Sources were verified read-only; the name and student ID were supplied directly by the author; the new detailed design has been independently reviewed |

## 2. Valuable Contributions

AI helped set out the implicit dependencies between requirements: a calendar-day stay depends on times that cross midnight, itinerary recovery depends on the dataset version and the anchor, AI rerouting depends on the same state, and drawing a route cannot replace railway feasibility. Expressing these relations as entities and use cases guides later implementation better than adding more pages alone.

The tools also suited explicit mechanical checks, such as fixing relative links after a migration, verifying stable feature numbers, comparing file contents, and checking a synthetic worked example. It lowered the cost of repeated organization, but did not by itself turn a service that had not been run into evidence.

## 3. Limitations and Corrections in Practice

First, AI readily carries over the context of an earlier project. The archived claims that "AI only pre-fills three slots" and "history is not saved" conflict with the new multi-turn requirements, and the inventory/seat-locking model cannot be copied directly into the planning architecture either. This round rewrote the responsibilities against the current requirements and kept the old material as a record of the evolution.

Second, automatically generated scope and facts can look more complete than they are. The local draft stores only nodes and dates and cannot be described as full persistence of a personalized itinerary; a frontend illustrative track cannot be described as real railway matching. The materials distinguish the current interface, the target design, and actual verification.

Third, tool execution can fail. An earlier documentation migration produced patch context mismatches and a checklist that inadvertently included files still to be edited; this round's figure rendering hit a read failure caused by encoding, which passed when read as UTF-8, and the body check then found that the risk table header did not match the number of rows and columns, which was corrected. The record keeps the failure and the later correction. Automated checks find only the conditions they cover; they cannot prove that user flows, licence compliance, or model facts are correct.

Fourth, references and external capabilities need fresh verification. This round read only official technical documentation and upstream repositories; after the original Amap page timed out on access, the accessible official search documentation was checked instead. No keyed interface was called, and a readable page was not treated as proof that an account quota had been verified.

## 4. Critical Assessment of the Deliverables

The figures in this round are a target design distilled from the requirements; consistent PNG/SVG output and valid internal links show only that the material structure is usable. Import and real geometry were delivered in the 11-19 MVP and passed independent review and user acceptance; server-side per-owner isolation, save concurrency, product AI guardrails, and the full dataset still need a PoC. Reference material shapes design choices but does not replace validation against this project's samples.

The progress of 2026-11-19 answers part of this. Import, direct-service query, and segment track geometry were implemented; independent review reproduced the 16 MVP items, and user acceptance passed. This confirms the division in which a deterministic service verifies railway facts, and shows that AI-drafted code must be retested by a context that did not write it; author self-tests and screenshots cannot replace an independent conclusion. Product AI and account saving remain design, and their guardrails and concurrency behaviour are deferred with the complete product; cross-browser and real-device testing were not performed.

Decision/search/development/review are a division of development responsibilities, not four human members, and do not indicate that independent review has been completed. The author may use AI for drafting and self-checking, but independent review must be performed by a context that did not write the output. Final member contributions and responsibility for the course submission remain with the author.

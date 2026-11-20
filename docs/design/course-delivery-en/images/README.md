# Prototype Image Sources

This directory holds seven images in two layers: four screenshots of the implemented MVP captured on 2026-11-20 00:18 (the state of the 2026-11-19 implementation and acceptance), and three interface prototypes of the 2026-11-17 version used as target-design references. The two layers are not interchangeable. Attribution marks and the "historical replay" badge inside the screenshots are preserved as-is; nothing was cropped and no text was altered.

The running application's interface is in Chinese. All screenshots therefore show a Chinese-language UI; captions and the surrounding text are English.

## 1. Core result states of the implemented MVP (captured 2026-11-20 00:18)

Capture conditions: the local `web` deployment (one Spring Boot process serving both the frontend and `/api`), the fixed GTFS package `gtfs-20261116-085531` in a real MySQL instance, reference service day 2026-11-16, and the real Amap JS API basemap; 1440x900 viewport, headless system Chrome. The data path has passed independent review and item-by-item user acceptance, but the images themselves only show what the interface renders; they do not replace the acceptance record.

| Image | State shown | Source file | Size |
| --- | --- | --- | --- |
| [Candidate list](ui-result-list.png) | VNP to AOH, 40 direct services | `output/course-shots/result-list.png` | 1440x900 |
| [Selected segment and real track](ui-result-segment.png) | G531, VNP seq 1 to NKH seq 10 (first 10 of 13 stops) | `output/course-shots/result-selected.png` | 1440x900 |
| [Cross-day segment](ui-result-crossday.png) | T297, BJP seq 1 to HBB seq 8 | `output/course-shots/result-crossday.png` | 1440x900 |
| [Track unavailable](ui-result-unavailable.png) | K339, no shape association | `output/course-shots/result-unavailable.png` | 1440x900 |

## 2. Target-design prototypes of the full product (2026-11-17 interface)

These three images come from development self-test screenshots taken on that day and are copied unchanged. That interface included multi-city node editing, an AI assistant tab and a "my trips" tab; the MVP was subsequently narrowed, and the current implementation mounts only the direct-service replay, so these images serve as interface design references for the full product only. They must not be read as the current interface.

| Image | Original workspace file | Size |
| --- | --- | --- |
| [Desktop route workspace](ui-desktop-route.png) | `output/accept-1440-route.png` | 1440x900 |
| [Mobile drawer](ui-mobile-route.png) | `output/accept-390-half.png` | 390x844 |
| [AI unavailable](ui-ai-unavailable.png) | `output/accept-ai-unavailable.png` | 1440x900 |

The "sample data", "2025 edition" labels and synthetic tracks in those images belong to the fixtures used that day; they cannot be read as the fixed GTFS package or as services actually running on that date. The AI failure screen does not prove that multi-turn AI was connected. Real mobile devices, soft keyboards, map gestures, hit targets and the attribution area still need verification; see [UI and UX Design](../ui-ux.md).

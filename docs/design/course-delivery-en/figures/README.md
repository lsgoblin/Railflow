# Course Design Figures

The six figures in this directory were generated from the CD-20261119 course draft and checked against it. PNG files serve for direct reading, while SVG files keep text, shapes, and connectors editable. The figures express the target design and are neither run logs nor independent review results; the explanation in each delivery document takes precedence, and the implementation status for this round is in the [delivery notes](../README.md).

| Figure | Topic | Reading version | Editable version |
| --- | --- | --- | --- |
| 1 | System structure and responsibilities | [PNG](01-system-architecture.png) | [SVG](01-system-architecture.svg) |
| 2 | Deployment and trust boundaries | [PNG](02-deployment.png) | [SVG](02-deployment.svg) |
| 3 | Domain structure and association cardinalities | [PNG](03-domain-model.png) | [SVG](03-domain-model.svg) |
| 4 | UC-01 city route building and planning interaction | [PNG](04-planning-sequence.png) | [SVG](04-planning-sequence.svg) |
| 5 | UC-02 multi-turn AI revision and version protection | [PNG](05-ai-update-sequence.png) | [SVG](05-ai-update-sequence.svg) |
| 6 | Two entry points and the shared user flow | [PNG](06-user-flow.png) | [SVG](06-user-flow.svg) |

Use-case IDs are consistent with the [requirements](../requirements-update.md) and the [models](../design-models.md). Figure 1 gives an overview of system containers and responsibilities, with the internal modules expanded in tables in the architecture body text; Figure 2 presents deployment separately. Figure 3 is a simplified domain structure, and the complete objects, attributes, and invariants appear in the model body text. Figures 4 and 5 read downward in time: dashed lines are participant lifelines, and arrowed connectors show the message direction. Figures 1 and 2 are C4-style container and deployment views, Figure 3 is a simplified UML-style class/domain model, and Figures 4 and 5 are UML-style sequence diagrams.

## Changed Elements React Experiment - Direct Comparison Workflow

### HYPOTHESIS:
If we use changeset group processing without processing the changed elements, then the result of the direct processing will be produced faster and will resemble GitHub's diff functionality by displaying a flat list of changes.

### REASON FOR EXPERIMENT
Changed elements undergo extensive processing to ensure a presentation-based summary of changes in an iModel. We aim to understand how a feature like Version Comparison would operate using raw changeset group results instead of presentation ruleset-based property path traversal. We expect faster loading times for Direct Comparison due to reduced processing, while still providing valuable output to the user.

### EXPERIMENT
We conducted multiple experiments to confirm our hypothesis. The steps were:

1. Run the Version Compare V2 workflow (Post/Get/Display) for an iModel with an unprocessed job range. Record the time until the user can interact with the job-related information on the UI.
2. Run the experimental Direct Comparison on the same unprocessed job version. Record the time until the user can interact with the job-related information on the UI.

#### Results Table
We tested across three different iModels of varying sizes in the QA region to draw better conclusions.

| Itwin | IModel | V2 Processing Time till interaction in UI (ms) | V2 Changed Elements UI Must Process | Direct Comparison Processing Time till interaction in UI (ms) | Direct Comparison Changed Elements UI Must Process | % diff between V2 and Direct Processing |
| -- | -- | -- | -- | -- | -- | -- |
| 413e666d-1e25-4d8e-9927-12db8995dfd0 | c87854bc-1197-4ed9-8d3d-ad9cb5fd1347 | 15909 | 5311 | 13249 | 59368 | 18.24% |
| 413e666d-1e25-4d8e-9927-12db8995dfd0 | 9576d8b7-3c8f-4857-857d-1e56d2107510 | 1198084 | 169776 | 204125 | 418309 | 142% |
| 413e666d-1e25-4d8e-9927-12db8995dfd0 | a9948fe0-022c-4b6c-bd4e-604b632a74a4 | 394015 | 112951 | 68022 | 772599 | 141% |

### RESULTS SUMMARY
The most salient findings of our testing:

1. On iModels with a vast amount of data to process, Direct Comparison is about 1.4 times faster than V2 Comparison.
2. On smaller iModels, the percentage difference is slightly better for the Direct Comparison workflow.
3. The UI has more elements to process with the Direct Comparison workflow than with the V2 workflow.

### CONCLUSION
This experiment proved that the Direct Comparison workflow is viable and may be preferable in some situations for larger iModels due to its processing speed. Direct Comparison may be an efficacious solution to long waiting times if the user does not require the full information provided by property traversal.

## Changed Elements React Experiment - Direct Comparison Workflow

### HYPOTHESIS:
If we use changeset group processing without processing the changed elements, then the result of the direct processing will be produced faster and will resemble GitHub's diff functionality by displaying a flat list of changes.

###  REASON FOR EXPERIMENT
Changed elements does a lot of processing to ensure that we show a presentation-based summary of what has changed in an iModel. We want to understand how a feature-like Version Comparison would operate if we used the raw changeset group results instead of doing presentation ruleset-based property path traversal. We expect to see faster loading times for running a Direct Comparison due to removing excess processing but still have an output that would be valuable to the user.

### EXPERIMENT
We conducted multiple experiments in the hopes of confirming our hypothesis:
Steps for our experiments:

1. Run Version compare V2 workflow(Post/Get/Display) for a iModel with an unprocessed job range. Record the time till the user was able to interact with the information related to that job on the UI.
2. Run experimental Direct Comparison on the same unprocessed job version. Record the time till the user was able to interact with the information related to that job on the UI.

#### Results Tabel
We tested across three different iModels of varying sizes in the QA region. We wanted to test a variety of sizes for iModels and the changed elements processed in the group comparison to draw a better conclusion.

Itwin | IModel |V2 Processing Time till interaction in UI (ms) | V2 Changed Elements UI Must Process | Direct Comparison Processing Time till interaction in UI (ms) | V2 Changed Elements UI Must Process | % diff between V2 and Direct Processing |
-- | -- | -- | -- | -- | -- | --
413e666d-1e25-4d8e-9927-12db8995dfd0| c87854bc-1197-4ed9-8d3d-ad9cb5fd1347 | 15909 | 5311 | 13249 | 59368 | 18.24%
413e666d-1e25-4d8e-9927-12db8995dfd0| 9576d8b7-3c8f-4857-857d-1e56d2107510 | 1198084 | 169776 | 204125 | 418309 | 142%
413e666d-1e25-4d8e-9927-12db8995dfd0 | a9948fe0-022c-4b6c-bd4e-604b632a74a4 | 394015 | 112951 | 68022 | 772599 | 141%

### RESULTS SUMMARY
The most salient findings of our testing:

1. On iModels with vast amount of data that must be processed. Direct Comparison is about 1.4 times faster than V2 Comparison.
2. On smaller iModels the % difference is slightly better for Direct Comparison workflow.
3. The UI has more elements to look through with Direct comparison workflow than V2 workflow.

### Conclusion
This experiment proved that Direct Comparison workflow is viable and maybe preferable in some situations for larger iModels due to its speed of processing. Direct comparison may be an efficacious solution to long waiting times for processing, if the user does not desire that full information provided by property traversal.

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
We tested across three different iModels of varying sizes in the DEV region to draw better conclusions.

| Itwin | IModel | Number Of Changeset Processed (V2 / Direct Comparison) | V2 Processing Time till interaction in UI (ms) | V2 Number of Changed Elements Found | Direct Comparison Processing Time till interaction in UI (ms) | Direct Comparison Number of Changed Elements Found | % diff between V2 and Direct Processing |
| -- | -- | -- | -- | -- | -- | -- | -- |
| 1036c64d-7fbe-47fd-b03c-4ed7ad7fc829 | c87854bc-1197-4ed9-8d3d-ad9cb5fd1347 | 12 | 22133 | 5342 | 6536 | 28039 | 108.807% |
| 1036c64d-7fbe-47fd-b03c-4ed7ad7fc829 | e657e0d6-fad1-4971-9c22-459bd400534b | 524 | 185067 | 109474 | 71375 | 314907 | 88.6688% |
| 1036c64d-7fbe-47fd-b03c-4ed7ad7fc829 | b8571aeb-dc0b-405f-bf6b-42401af40dd1 | 23 | 109007 | 128803 | 26017 | 22348 | 122.926% |

### RESULTS SUMMARY
The most salient findings of our testing:

1. On iModels with a vast amount of data to process, Direct Comparison is on average 106.8 % faster than V2 Comparison.
2. The UI has more elements to process with the Direct Comparison workflow than with the V2 workflow.
3. The larger the IModel/changeset range. The v2 processing is faster due to multiple agents used for processing.

### CONCLUSION
This experiment proved that the Direct Comparison workflow is viable and may be preferable in some situations for larger iModels due to its processing speed. Direct Comparison may be an efficacious solution to long waiting times if the user does not require the full information provided by property traversal.

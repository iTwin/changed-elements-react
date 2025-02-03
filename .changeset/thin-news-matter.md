---
"@itwin/changed-elements-react": minor
---

```
export type V2DialogProviderProps = {
  children: React.ReactNode;
  // Optional. When enabled will toast messages regarding job status. If not defined will default to false and will not show toasts.
  enableComparisonJobUpdateToasts?: boolean;
  /** On Job Update
 * Optional. a call back function for handling job updates.
 * @param comparisonJobUpdateType param for the type of update:
 *  - "JobComplete" = invoked when job is completed
 *  - "JobError" = invoked on job error
 *  - "JobProcessing" = invoked on job is started
 *  - "ComparisonVisualizationStarting" = invoked on when version compare visualization is starting
 * @param toaster from iTwin Ui's useToaster hook. This is necessary for showing toast messages.
 * @param jobAndNamedVersion param contain job and named version info to be passed to call back
*/
  onJobUpdate?: (comparisonJobUpdateType: ComparisonJobUpdateType, toaster: ReturnType<typeof useToaster> ,jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
};
```

Toaster is no longer an exported member from iTwin UI 3.x.x. UseToaster is now required to be called in the callee of V2Dialog for onJobUpdate.

```
import { useToaster } from "@itwin/itwinui-react";
const toaster = useToaster();
onJobUpdate(comparisonEventType, toaster, jobAndNamedVersions);
```

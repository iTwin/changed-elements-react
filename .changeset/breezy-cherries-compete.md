---
"@itwin/changed-elements-react": patch
---

Added a feedback button to the experimental UI and fixed the spacing on named versions in the new widget list.
Import moved for experimental UI. As previous way of importing did not work.
Marked new component as a alpha and and subject to change.
  ```TypeScript
  import { NamedVersionSelectorWidget } from "@itwin/changed-elements-react";

  [...]

    return (
      <VersionCompareContext iModelsClient={iModelsClient}>
        <NamedVersionSelectorWidget iModel={iModel} />
      </VersionCompareContext>
    );
  }
  ```

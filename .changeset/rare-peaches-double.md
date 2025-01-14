---
"@itwin/changed-elements-react": minor
---

- Added new env file bool for toggling experimental features VITE_RUN_EXPERIMENTAL
- Added new workflow for releases/publish and documented process in publish_readme.md
- Added experimental React component for the new Named Version selector. Its name or API is not stable yet, but you can try it out the following way.

  ```TypeScript
  import { NamedVersionSelectorWidget } from "@itwin/changed-elements-react/experimental";

  [...]

    return (
      <VersionCompareContext iModelsClient={iModelsClient}>
        <NamedVersionSelectorWidget iModel={iModel} />
      </VersionCompareContext>
    );
  }
  ```

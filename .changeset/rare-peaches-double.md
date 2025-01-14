---
"@itwin/changed-elements-react": minor
---

- Fixed issue with modal where loading spinner appears if no named versions where available. Now a message appears letting user know if named versions are not available.
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

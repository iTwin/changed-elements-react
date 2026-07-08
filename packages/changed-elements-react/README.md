# @itwin/changed-elements-react

## About

This package provides React components that help implement iTwin version comparison workflows. These components are designed to communicate with iTwin Platform Changed Elements APIs (v1/v2/v3) to retrieve data about iModel change history.

API Documentation:
- [V3 API Documentation - Tech Preview](https://developer.bentley.com/apis/changed-elements-v3/)
- [V2 API Documentation](https://developer.bentley.com/apis/changed-elements-v2/)
- [V1 API Documentation - DEPRECATED](https://developer.bentley.com/apis/changed-elements/)

## Installation

```shell
pnpm install @itwin/changed-elements-react
```

## Usage

To begin using this package in your application, you will need to:

1. Add `changedelements:read` and `changedelements:modify` OAuth scopes to your iTwin Platform application [App Setup](https://developer.bentley.com/tutorials/quickstart-web-and-service-apps/).
2. Provide `<VersionCompareContext />` somewhere in your app.

    ```tsx
    import { ComparisonJobClient, VersionCompare, VersionCompareContext } from "@itwin/changed-elements-react";

    const comparisonJobClient = new ComparisonJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: VersionCompare.getAccessToken,
    });

    <VersionCompareContext iModelsClient={iTwinIModelsClient} comparisonJobClient={comparisonJobClient}>
      <App />
    </VersionCompareContext>
    ```

3. Initialize Version Compare module at application startup. This only needs to be done once.

    ```ts
    import { VersionCompare } from "@itwin/changed-elements-react";

    VersionCompare.initialize({
      ... // Look at VersionCompareOptions interface for documentaton about the options
    });
    ```

4. The `<ChangedElementsWidget />` React component lets users inspect differences in properties between versions, generate reports, search for changed elements, and control element visibility. The following code shows an example widget initialization (does not show off all props).

    ```ts
    import { ChangedElementsWidget } from "@itwin/changed-elements-react";

    <ChangedElementsWidget
      apiVersion="v2"
      feedbackUrl="https://example.com"
      iModelConnection={UiFramework.getIModelConnection()}
      enableComparisonJobUpdateToasts
      manageNamedVersionsSlot={<ManageNamedVersions />}
      documentationHref="https://example.com"
    />,
    ```

### V3 setup

Use `DiffJobClient` in `VersionCompareContext` and set `apiVersion="v3"` on `ChangedElementsWidget`.

```tsx
import { DiffJobClient, VersionCompare, VersionCompareContext } from "@itwin/changed-elements-react";

const comparisonJobClient = new DiffJobClient({
  baseUrl: "https://api.bentley.com/changedelements",
  getAccessToken: VersionCompare.getAccessToken,
  iModelsClient: iTwinIModelsClient,
  diffingStrategy: "VersionCompare",
});

<VersionCompareContext iModelsClient={iTwinIModelsClient} comparisonJobClient={comparisonJobClient}>
  <ChangedElementsWidget
    apiVersion="v3"
    iModelConnection={UiFramework.getIModelConnection()}
    enableComparisonJobUpdateToasts
  />
</VersionCompareContext>
```

`useV2Widget` is still supported for backward compatibility, but `apiVersion` is the preferred prop moving forward.

5. The `<NamedVersionSelectorWidget />` is an **experimental** React component that lets users inspect differences in properties between versions, generate reports, search for changed elements, and control element visibility. The following code shows an example widget initialization (does not show off all props).

    ```ts
    import { NamedVersionSelectorWidget } from "@itwin/changed-elements-react";

    <NamedVersionSelectorWidget
      iModel={iModel}
      manager={VersionCompare.manager}
      manageVersions={<ManageNamedVersions />}
      feedbackUrl="https://example.com"
      documentationHref="https://example.com"
    />
    ```

6. The `<PropertyComparisonTable />` React component lists properties of a selected element and displays how they changed between two versions.

    ```ts
    import { PropertyComparisonTable } from "@itwin/changed-elements-react";

    <PropertyComparisonTable
      manager={versionCompareManager}
      selection={selection}
      isSideBySide={false}
      displaySideBySideToggle={true}
      onSideBySideToggle={() => {
        // handle toggle logic here
      }}
    />
    ```

## Contributing

### Issues

We welcome contributions to make this package better. You can submit feature requests or report bugs by creating an [issue](https://github.com/iTwin/changed-elements-react/issues).

### Versioning with Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage package versioning and changelogs. When making changes that affect the public API or behavior, please add a changeset by running:

```shell
pnpm changeset
```

Follow the prompts to describe your changes and select the appropriate version bump (major, minor, or patch). Versioning should follow [semver](https://semver.org/) conventions. If no version bump is required (such as for documentation-only changes), use `pnpm changeset --empty`.

When changesets are added and merged into the main branch, a release pull request (PR) will be automatically created by the Changesets GitHub Action. This PR will contain the version updates and changelog entries generated from your changesets. Review the release PR to ensure the version bumps and changelog messages are accurate before merging. Once the release PR is merged, the new package version will be published automatically.

For more details, see the [Changesets documentation](https://github.com/changesets/changesets/blob/main/README.md).

---

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

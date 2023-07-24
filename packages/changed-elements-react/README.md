# @itwin/changed-elements-react

## About

This package provides React components that help implement iTwin version comparison workflows. These components are designed to communicate with [iTwin Platform Changed Elements API](https://developer.bentley.com/apis/changed-elements/), which is used to retrieve data about iModel change history.

## Installation

```shell
npm install @itwin/changed-elements-react
```

## Usage

To begin using this package in your application, you will need to:

1. Add `changedelements:read` and `changedelements:modify` OAuth scopes to your iTwin Platform application.
2. Provide `<VersionCompareContext />` somewhere in your app.

    ```tsx
      <VersionCompareContext>
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

4. Mount `<VersionCompareSelectComponent />` to begin version comparison worflow by selecting iModel versions to compare. You should also add a button in your UI that calls `VersionCompare.manager.stopComparison()`.
5. `<ChangedElementsWidget />` React component lets users inspect differences in properties between versions, generate reports, search for changed elements, and control element visibility.
6. `<PropertyComparisonTable />` React component lists properties of a selected element and displays how they changed between two versions.

## Contributing

We welcome contributions to make this package better. You can submit feature requests or report bugs by creating an [issue](https://github.com/iTwin/changed-elements-react/issues).

---

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

# @itwin/changed-elements-react

## About

This package provides React components that help implement iTwin version comparison forkflows. These components are designed to communicate with [iTwin Platform Changed Elements API](https://developer.bentley.com/apis/changed-elements/), which is used to retrieve data about iModel change history.

## Installation

```shell
npm install @itwin/changed-elements-react
```

## Usage

This package is intended to be used together with iTwin.js AppUI framework, however it is also possible to use the provided components without it. Either way, to begin using this package in your application, you will need to:

1. Add `changedelements:read` and `changedelements:modify` OAuth scopes to your iTwin Platform application.
2. Place `VersionCompareContext` somewhere high on the React components tree where all the rest `@itwin/changed-elements-react` components can access it.

    ```tsx
      <VersionCompareContext>
        <App />
      </VersionCompareContext>
    ```

### Integrating with AppUI framework

1. Initialize VersionCompare module with `VersionCompare.initialize()`.

    ```ts
    VersionCompare.initialize({
      appUiOptions: {
        // List frontstages where version compare widgets should be present
        frontstageIds: [MyFrontstageId0, MyFrontstageId1, ...],
      },
      ... // Look at VersionCompareOptions interface for documentaton of other options
    });
    ```

2. Add a way to invoke `VersionCompareSelectDialog`. You may use pre-defined `openSelectDialog()` function to start the dialog, or use `openSelectDialogToolButton()` to create a tool button that can be added to the AppUI tools section.

    ```ts
    import { openSelectDialog } from "@itwin/changed-elements-react";

    const handleClick = () => openSelectDialog(iModelConnection, accessToken);
    ```

3. Add `ChangedElementsWidget` to a frontstage. This widget lets users inspect differences in properties between iModel versions, generate reports, search for changed elements, and control element visibility.

    ```ts
    class MyFrontstageItemsProvider implements UiItemsProvider {
      public readonly id = MyFrontstageItemsProvider.name;

      public provideWidgets(
        stageId: string,
        stageUsage: string,
        location: StagePanelLocation,
        section?: StagePanelSection,
      ): Widget[] {
        if (
          stageId !== MainFrontstageProvider.name ||
          stageUsage !== StageUsage.General ||
          location !== StagePanelLocation.Right ||
          section !== StagePanelSection.Start
        ) {
          return [];
        }

        return [{ id: "ChangedElementsWidget", content: <ChangedElementsWidget /> }];
      }
    }
    ```

### As stand-alone React components

If your application does not use AppUI, you can still use components from this package.

1. Initialize Version Compare with `VersionCompare.initialize()` and specify `wantAppUi` as `false`.

    ```ts
    VersionCompare.initialize({
      wantAppUi: false,
      simpleVisualizationOptions: {
        getPrimaryViewport: () => {
          // Return which viewport you want visualization to occur on
          return IModelApp.viewManager.selectedView;
        }
      },
      ... // Look at VersionCompareOptions interface for documentaton of other options
    });
    ```

2. Mount `VersionCompareSelectComponent` to begin version comparison worflow by selecting iModel versions to compare. You should also add a button in your UI that calls `VersionCompare.manager.stopComparison()`.
3. `ChangedElementsWidget` React component lets users inspect differences in properties between versions, generate reports, search for changed elements, and control element visibility.
4. `PropertyComparisonTable` React component lists properties of a selected element and displays how they changed between two versions.

## Contributing

We welcome contributions to make this package better. You can submit feature requests or report bugs by creating an [issue](https://github.com/iTwin/changed-elements-react/issues).

---

Copyright © Bentley Systems, Incorporated. All rights reserved. See [LICENSE.md](./LICENSE.md) for license terms and full copyright notice.

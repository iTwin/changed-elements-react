# @itwin/changed-elements-react

## About

This package provides React components that implement iTwin version comparison forkflows. These components communicate via [iTwin Platform Changed Elements API](https://developer.bentley.com/apis/changed-elements/) to retrieve data about changed elements.

## Installation

```shell
npm install @itwin/changed-elements-react
```

## Usage

### Integrating with @itwin/appui-react

To integrate version comparison features with AppUI framework, you will need to do the following:

1. If you are using iTwin Platform Changed Elements endpoint (default), add `changedelements:read` scope to your OAuth client.
2. Initialize VersionCompare module with `VersionCompare.initialize()`.

    ```TypeScript
    VersionCompare.initialize({
      ninezoneOptions: {
        // List frontstages where version compare widgets should be present
        frontstageIds: [MyFrontstageId0, MyFrontstageId1, ...],
      },
      ...
      // Look at VersionCompareOptions interface for all other options
    });
    ```

3. Add a way to invoke `VersionCompareSelectDialog`. You may use `openSelectDialog` function to start the dialog, or add a pre-defined tool button returned by `openSelectDialogToolButton` to the tools section.

    ```TypeScript
    // Open version compare select dialog
    const onClick = () => {
      // Last parameter is optional. VersionCompare will use onViewChanged event to refresh
      // its widgets when visibility of elements changes.
      await openSelectDialog(iModelConnection, accessToken, onViewChanged);
    }
    ```

    You may also use the `openSelectDialogToolButton` function to get a button to add to your tool buttons.

4. Add `ChangedElementsWidget` to a frontstage. This widget lets users to inspect differences in properties between versions, generate reports, search for changed elements, and control element visibility.

    ```TypeScript
    class MyFrontstageItemsProvider implements UiItemsProvider {
      public readonly id = MyFrontstageItemsProvider.name;
      public provideWidgets(
        stageId: string,
        stageUsage: string,
        location: StagePanelLocation,
        section?: StagePanelSection,
      ): CommonWidgetProps[] {
        if (
          stageId !== this.id ||
          stageUsage !== StageUsage.General ||
          location !== StagePanelLocation.Right ||
          section !== StagePanelSection.Start
        ) {
          return [];
        }

        return [{ id: "ChangedElementsWidget", getWidgetContent: () => <ChangedElementsWidget /> }];
      }
    }
    ```

### As stand-alone React components

If your application does not use AppUI or its frontstages, you can use the package like so:

1. If you are using iTwin Platform Changed Elements endpoint (default), add `changedelements:read` scope to your OAuth client.
2. Initialize Version Compare with `VersionCompare.initialize()`.

    ```TypeScript
    // Create the options so that version compare is aware of which viewports to use
    const options: SimpleVisualizationOptions = {
      getPrimaryViewport: () => {
        // Return which viewport you want visualization to occur on
        // Just as an example, you can use the selected view like so:
        return IModelApp.viewManager.selectedView;
      }
    };

    const options: VersionCompareOptions = {
      // Tell version compare you don't want ninezone functionality
      wantNinezone: false,
      // Use the options for visualization
      simpleVisualizationOptions,
      ...
      // Look at VersionCompareOptions interface for all other options
    };

    // Initialize the version compare package
    VersionCompare.initialize(options);
    ```

3. `VersionCompareSelectComponent` React component is intended to serve as a dialog that will be used to start a comparison. You should also add a button in your UI that stops comparison by calling `VersionCompare.manager.stopComparison()`.
4. `ChangedElementsWidget` React component lets users to inspect differences in properties between versions, generate reports, search for changed elements, and control element visibility.
5. `PropertyComparisonTable` React component lists properties of a selected element and displays how they changed between versions of an iModel.

## Contributing

We welcome contributions to make this package better. You can submit feature requests or report bugs by creating an [issue](https://github.com/iTwin/changed-elements-react/issues).

# Changelog

## 0.17.3

### Patch Changes

#### [0.17.3](https://github.com/iTwin/changed-elements-react/tree/v0.17.3/packages/changed-elements-react) - 2025-09-11

Fixed colors of toggles in filters to depict color legend of changes

## 0.17.2

### Patch Changes

#### [0.17.2](https://github.com/iTwin/changed-elements-react/tree/v0.17.2/packages/changed-elements-react) - 2025-09-03

Fixed header alignment for changed elements widget

## 0.17.1

### Patch Changes

#### [0.17.1](https://github.com/iTwin/changed-elements-react/tree/v0.17.1/packages/changed-elements-react) - 2025-09-03

Fixed miss-alignment issue in named versions entries

## 0.17.0

### Minor Changes

#### [0.17.0](https://github.com/iTwin/changed-elements-react/tree/v0.17.0/packages/changed-elements-react) - 2025-08-12

_Frontend Enhancements:_

1. Change named version list to be a infinite list, so we do not spam the UI with quires for constructing Named Versions

_Frontend Bug Fixes:_

1. Fixed active version header not clearing once a comparison is complete
2. Disabled process result buttons when a comparison is currently being run

## 0.16.0

### Minor Changes

#### [0.16.0](https://github.com/iTwin/changed-elements-react/tree/v0.16.0/packages/changed-elements-react) - 2025-08-05

_Frontend Enhancements:_

1. Provide consumers a way to inject their own changes and skip using the changed elements service altogether
2. Provide colorization overrides for any special customization logic
3. Provide a callback when changed instances are selected in the UI

_Backend Enhancements:_

1. Initial ChangesRpcInterface and ChangesRpcImpl which aim to allow using the Partial EC Change Unifier in a simplified way
2. The Rpc interface allows the app to provide relationships that they care about and marks any related changed ec instance with what relationships were affected that may drive the element for changes

See VersionCompare initialization options (`changesProvider`, `colorOverrideProvider` and `onInstancesSelected`) for more information.

### Patch Changes

#### [0.15.9](https://github.com/iTwin/changed-elements-react/tree/v0.15.9/packages/changed-elements-react) - 2025-08-05

### **Performance Issues Fixed:**

1. **Eliminated massive changeset over-fetching**

   - Previously loaded ALL changesets `[0 -> Inf)` upfront
   - Now uses efficient pagination (20 items at a time)

2. **Parallelized individual changeset queries**
   - Replaced sequential api calls with more efficient method

### **Critical Bug Fixed:**

3. **Missing index offset for Named Versions**
   - Fixed to properly apply `+1 offset` as required by [Changed Elements API](https://developer.bentley.com/tutorials/changed-elements-api/#221-using-the-api-to-get-changed-elements)

## 0.15.8

### Patch Changes

#### [0.15.8](https://github.com/iTwin/changed-elements-react/tree/v0.15.8/packages/changed-elements-react) - 2025-07-15

fix on advance filter

## 0.15.7

### Patch Changes

#### [0.15.7](https://github.com/iTwin/changed-elements-react/tree/v0.15.7/packages/changed-elements-react) - 2025-07-11

Changed elements gets hidden when toggling filters

## 0.15.6

### Patch Changes

#### [0.15.6](https://github.com/iTwin/changed-elements-react/tree/v0.15.6/packages/changed-elements-react) - 2025-07-07

bug fix- Turning off all properties on Advanced Filtering dialog hides elements incorrectly

## 0.15.5

### Patch Changes

#### [0.15.5](https://github.com/iTwin/changed-elements-react/tree/v0.15.5/packages/changed-elements-react) - 2025-06-26

Nvtable persists when loading comparison

#### [0.15.5](https://github.com/iTwin/changed-elements-react/tree/v0.15.5/packages/changed-elements-react) - 2025-06-26

spacing around che ele header buttons

## 0.15.4

### Patch Changes

#### [0.15.4](https://github.com/iTwin/changed-elements-react/tree/v0.15.4/packages/changed-elements-react) - 2025-06-06

fix alignment in header of version comapre

## 0.15.3

### Patch Changes

#### [0.15.3](https://github.com/iTwin/changed-elements-react/tree/v0.15.3/packages/changed-elements-react) - 2025-05-20

- swap stage progress with overall loading progress during version comparison

## 0.15.2

### Patch Changes

#### [0.15.2](https://github.com/iTwin/changed-elements-react/tree/v0.15.2/packages/changed-elements-react) - 2025-05-16

bug fix for search showing returning from version compare frontstage

## 0.15.1

### Patch Changes

#### [0.15.1](https://github.com/iTwin/changed-elements-react/tree/v0.15.1/packages/changed-elements-react) - 2025-05-16

Update itwin/core packages to version 5.0.0-dev.111

#### [0.15.1](https://github.com/iTwin/changed-elements-react/tree/v0.15.1/packages/changed-elements-react) - 2025-05-16

bug on filter pill missing after switching page

## 0.15.0

### Minor Changes

#### [0.15.0](https://github.com/iTwin/changed-elements-react/tree/v0.15.0/packages/changed-elements-react) - 2025-04-30

- Added ability to add custom documentation link to information pane.
  Pass href into top level widget as prop.

## 0.14.13

### Patch Changes

#### [0.14.13](https://github.com/iTwin/changed-elements-react/tree/v0.14.13/packages/changed-elements-react) - 2025-04-22

- Filters now respect viewState when restoring default view
- Filters now persist when switching frontstages

## 0.14.12

### Patch Changes

#### [0.14.12](https://github.com/iTwin/changed-elements-react/tree/v0.14.12/packages/changed-elements-react) - 2025-04-09

- Added responsive design for experimental widget. When widget is smaller size we display a minimal design.

## 0.14.11

### Patch Changes

#### [0.14.11](https://github.com/iTwin/changed-elements-react/tree/v0.14.11/packages/changed-elements-react) - 2025-04-02

- Fixed Changed Elements React issue where backing out of loading stage sometimes causes crashes. This is fixed by removing ability to backout of loading in experimental widget. This is in parity with how loading operates in the v2 widget.

## 0.14.10

### Patch Changes

#### [0.14.10](https://github.com/iTwin/changed-elements-react/tree/v0.14.10/packages/changed-elements-react) - 2025-03-20

- Fixed CSS for property comparison table slider

## 0.14.9

### Patch Changes

#### [0.14.9](https://github.com/iTwin/changed-elements-react/tree/v0.14.9/packages/changed-elements-react) - 2025-03-18

- Reverted colors of squares in property inspector
- Fixed job error and re-run logic
- Fixed side-by-side toggle not present in property comparison table

## 0.14.8

### Patch Changes

#### [0.14.8](https://github.com/iTwin/changed-elements-react/tree/v0.14.8/packages/changed-elements-react) - 2025-03-14

Fix vitest and axios vulnerabilities

## 0.14.7

### Patch Changes

#### [0.14.7](https://github.com/iTwin/changed-elements-react/tree/v0.14.7/packages/changed-elements-react) - 2025-02-25

Updates :

- tweaked on hover color for action btn
- changed info button icon

## 0.14.6

### Patch Changes

#### [0.14.6](https://github.com/iTwin/changed-elements-react/tree/v0.14.6/packages/changed-elements-react) - 2025-02-21

UI Updates

- Updated text to be more informative for no named versions present in imodel

## 0.14.5

### Patch Changes

#### [0.14.5](https://github.com/iTwin/changed-elements-react/tree/v0.14.5/packages/changed-elements-react) - 2025-02-20

- Updated font weights for current and target strings in namedVersion selector

## 0.14.4

### Patch Changes

#### [0.14.4](https://github.com/iTwin/changed-elements-react/tree/v0.14.4/packages/changed-elements-react) - 2025-02-19

Fixes:

- non experimental widget init state so it will no longer forever load

## 0.14.3

### Patch Changes

#### [0.14.3](https://github.com/iTwin/changed-elements-react/tree/v0.14.3/packages/changed-elements-react) - 2025-02-19

UI tweaks for:

- Font size, weight, and style
- Property comparison table coloring changes per row
- Updated colors for elements in tree (squares)

Fixes:

- Forever loading in the elements tree when backing out of property comparison (experimental widget only bug)

## 0.14.2

### Patch Changes

#### [0.14.2](https://github.com/iTwin/changed-elements-react/tree/v0.14.2/packages/changed-elements-react) - 2025-02-14

- Updates the new experimental widget's font weight and font size.
- Updates the current and target comparison header info to now be shown on the comparison tree widget.
- Fixes the filter box to fit the content, getting rid of the horizontal scroll bar.

## 0.14.1

### Patch Changes

#### [0.14.1](https://github.com/iTwin/changed-elements-react/tree/v0.14.1/packages/changed-elements-react) - 2025-02-05

-Fixes NamedVersionSelectorWidget showing loading and spinning forever when no named version present.

-Fixes default dialog being shown for NamedVersionSelectorWidget when comparison is started. Now we show the proper loading state with spinner instead of "no comparison loaded".

## 0.14.0

### Minor Changes

#### [0.14.0](https://github.com/iTwin/changed-elements-react/tree/v0.14.0/packages/changed-elements-react) - 2025-02-03

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

## 0.13.0

### Minor Changes

#### [0.13.0](https://github.com/iTwin/changed-elements-react/tree/v0.13.0/packages/changed-elements-react) - 2025-02-03

Updated Dependencies:

- appUi updated to 5.x.x
- itwinUi updated to 3.x.x
  Important Notice: These updates may cause breaking changes if consumers of this package have not yet updated to the latest versions of these dependencies. Please ensure that you have updated your dependencies to avoid any potential issues.

## 0.12.2

### Patch Changes

#### [0.12.2](https://github.com/iTwin/changed-elements-react/tree/v0.12.2/packages/changed-elements-react) - 2025-01-28

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

## 0.12.1

### Patch Changes

#### [0.12.1](https://github.com/iTwin/changed-elements-react/tree/v0.12.1/packages/changed-elements-react) - 2025-01-22

Fixed issue with modal where loading spinner appears if no named versions where available. Now a message appears letting user know if named versions are not available.

## 0.12.0

### Minor Changes

#### [0.12.0](https://github.com/iTwin/changed-elements-react/tree/v0.12.0/packages/changed-elements-react) - 2025-01-22

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

## 0.11.4

### Patch Changes

#### [0.11.4](https://github.com/iTwin/changed-elements-react/tree/v0.11.4/packages/changed-elements-react) - 2024-12-10

- Fix ES module imports not specifying script file extensions
- Fixed model toggle when hide all is on. When hide all is on and a model is toggled on we would show only unchanged elements for that model and not all changed elements for given model.
- Fix the following console warnings in development environment
  - Receiving invalid property when mounting `<ChangedElementsWidget />` with V2 version selector
  - Receiving invalid list ref when displaying changed elements list
  - `checked` checkbox property not being accompanied by `onChange` event handler when rendering element filters popup

## 0.11.3

### Patch Changes

#### [0.11.3](https://github.com/iTwin/changed-elements-react/tree/v0.11.3/packages/changed-elements-react) - 2024-11-6

- Fixed emphasized elements(EE) not being respected when version compare is stopped. Now (version compare)VC restores EE that were present before VC is run.

## 0.11.2

### Patch Changes

#### [0.11.2](https://github.com/iTwin/changed-elements-react/tree/v0.11.2/packages/changed-elements-react) - 2024-10-29

- Fixed color issues for feedback btn text

## 0.11.1

### Patch Changes

#### [0.11.1](https://github.com/iTwin/changed-elements-react/tree/v0.11.1/packages/changed-elements-react) - 2024-10-16

- Fix change report generation failures

## 0.11.0

### Minor Changes

#### [0.11.0](https://github.com/iTwin/changed-elements-react/tree/v0.11.0/packages/changed-elements-react) - 2024-10-08

- `JobAndNamedVersions` now exported through the barrel
- `ComparisonJob` models now exported through the barrel

## 0.10.0

### Minor Changes

#### [0.10.0](https://github.com/iTwin/changed-elements-react/tree/v0.10.0/packages/changed-elements-react) - 2024-10-08

- `Changed Elements React` removed pseudo-commonjs modules from build output
- `ChangedElementEntryCache` Entries will now be compared and loaded based on cached value not, unchanged current value being check. This prevents an infinite loop.

## 0.9.2

### Patch Changes

#### [0.9.2](https://github.com/iTwin/changed-elements-react/tree/v0.9.2/packages/changed-elements-react) - 2024-07-26

- `VersionCompareSelectWidget` V2 will now end the active comparison and start a new one once a new one is triggered instead of doing a no-op on starting a new comparison.

## 0.9.1

### Patch Changes

#### [0.9.1](https://github.com/iTwin/changed-elements-react/tree/v0.9.1/packages/changed-elements-react) - 2024-07-10

- `VersionCompareSelectModal` V2 toast now fixed when opening and closing modal.

## 0.9.0

### Minor Changes

#### [0.9.0](https://github.com/iTwin/changed-elements-react/tree/v0.9.0/packages/changed-elements-react) - 2024-07-03

- `VersionCompareFeatureTracking` can now be fed to initialization options

## 0.8.0

### Minor Changes

#### [0.8.0](https://github.com/iTwin/changed-elements-react/tree/v0.8.0/packages/changed-elements-react) - 2024-06-28

- `VersionCompareSelectModal` V2 now uses paging to load named version resulting in faster load times.
- package updates fixing package vulnerabilities

## 0.7.0

### Minor Changes

#### [0.7.0](https://github.com/iTwin/changed-elements-react/tree/v0.7.0/packages/changed-elements-react) - 2024-06-05

- `VersionCompareManager.startComparisonV2`: Invoke `VersionCompareManager.stopComparison` when recovering from error

## 0.6.4

### Patch Changes

#### [0.6.4](https://github.com/iTwin/changed-elements-react/tree/v0.6.4/packages/changed-elements-react) - 2024-05-23

- Fixes comparison job error workflow in `VersionCompareSelectModal`. When error jobs are re-run, they delete the existing broken job and re-run a new job for the given job ID.

## 0.6.3

### Patch Changes

#### [0.6.3](https://github.com/iTwin/changed-elements-react/tree/v0.6.3/packages/changed-elements-react) - 2024-05-21

- Fixes spurious 409 error in onClick work flow in `ChangedElementsWidget`

## 0.6.2

### Patch Changes

#### [0.6.2](https://github.com/iTwin/changed-elements-react/tree/v0.6.2/packages/changed-elements-react) - 2024-05-15

- Fix deleted elements not appearing in `ChangedElementsWidget`

## 0.6.1

### Patch changes

#### [0.6.1](https://github.com/iTwin/changed-elements-react/tree/v0.6.1/packages/changed-elements-react) - 2024-05-01

- Fixed filtering for deleted elements not showing in models
- Fixed display and missing label for deleted elements

## 0.6.0

### Minor Changes

#### [0.6.0](https://github.com/iTwin/changed-elements-react/tree/v0.6.0/packages/changed-elements-react) - 2024-04-12

- `VersionCompareManager`: removed the ability to pass a component to v2 widget VC dialog by using the `manageNamedVersionsSlot` setting
- `VersionCompareManager` : Added the ability to filter elements with startComparisonV2 call in the same fashion as startComparisonV1.

## 0.5.0

### Minor Changes

#### [0.5.0](https://github.com/iTwin/changed-elements-react/tree/v0.5.0/packages/changed-elements-react) - 2024-04-01

- `VersionCompareManager`: Add ability to hide side-by-side comparison toggle by setting `displaySideBySideToggle` property to `false`
- `VersionCompareManager`: Add ability to pass a component to v2 widget VC dialog by using the `manageNamedVersionsSlot` setting

## 0.4.0

### Minor Changes

#### [0.4.0](https://github.com/iTwin/changed-elements-react/tree/v0.4.0/packages/changed-elements-react) - 2024-03-29

- `PropertyComparisonTable`: Add ability to hide side-by-side comparison toggle by setting `displaySideBySideToggle` property to `false`

## 0.3.11

### Patch changes

#### [0.3.11](https://github.com/iTwin/changed-elements-react/tree/v0.3.11/packages/changed-elements-react) - 2024-03-04

- Added new component to modal for handling named versions
- Added ability to make toasts optional and added optional call back for onJobUpdate

## 0.3.10

### Patch changes

#### [0.3.10](https://github.com/iTwin/changed-elements-react/tree/v0.3.10/packages/changed-elements-react) - 2024-02-26

- Callbacks for comparison job progress
- Allow disabling toast messages

## 0.3.8

### Patch changes

#### [0.3.8](https://github.com/iTwin/changed-elements-react/tree/v0.3.8/packages/changed-elements-react) - 2024-02-14

- Fix start changeset inclusion when starting comparison jobs.

## 0.3.7

### Patch changes

#### [0.3.7](https://github.com/iTwin/changed-elements-react/tree/v0.3.7/packages/changed-elements-react) - 2024-02-14

- Use itwinui-react as direct dependency.

## 0.3.6

### Patch changes

#### [0.3.6](https://github.com/iTwin/changed-elements-react/tree/v0.3.6/packages/changed-elements-react) - 2024-02-13

- Export V2 selector dialog.

## 0.3.5

### Patch changes

#### [0.3.5](https://github.com/iTwin/changed-elements-react/tree/v0.3.5/packages/changed-elements-react) - 2024-02-13

- Add functionality for using Changed Elements V2 for visualizing changes.
- Changed Elements Widget now works with V2 when supplied with the new prop `useV2Widget`.

## 0.3.4

### Patch changes

#### [0.3.4](https://github.com/iTwin/changed-elements-react/tree/v0.3.4/packages/changed-elements-react) - 2023-12-15

- You can now check change tracking status by calling `VersionCompare.isChangeTrackingEnabled`.

## 0.3.3

### Patch Changes

#### [0.3.3](https://github.com/iTwin/changed-elements-react/tree/v0.3.3/packages/changed-elements-react) - 2023-10-10

- Fix `ReportGeneratorDialog` not listing any changed properties.

## 0.3.2

### Patch changes

#### [0.3.2](https://github.com/iTwin/changed-elements-react/tree/v0.3.2/packages/changed-elements-react) - 2023-09-25

- Reduce likelihood of style clashes for `ExpandableSearchBar` component.
- Replace outdated CSS variables in `ExpandableSearchBar` style rules.

## 0.3.1

### Patch changes

#### [0.3.1](https://github.com/iTwin/changed-elements-react/tree/v0.3.1/packages/changed-elements-react) - 2023-08-31

- Change empty state appearance of `VersionCompareSelectDialog`.
- Improve changed elements widget startup performance by deferring model node loading.

## 0.3.0

### Minor Changes

#### [0.3.0](https://github.com/iTwin/changed-elements-react/tree/v0.3.0/packages/changed-elements-react) - 2023-08-14

- `VersionCompare.initialize` no longer accepts `iModelsClient` instance. Instead, you have to supply an object which implements our custom `IModelsClient` interface to `VersionCompareContext`. We expose a default client implementation as `ITwinIModelsClient`.
- `VersionCompareSelectDialog` now updates named version list every time it is mounted.
- Remove `@itwin/imodels-client-management` dependency.

### Patch Changes

- Fix `VersionCompareSelectDialog` getting stuck in loading state when there are no named versions present.

## 0.2.0

### Minor Changes

#### [0.2.0](https://github.com/iTwin/changed-elements-react/tree/v0.2.0/packages/changed-elements-react) - 2023-07-20

### Breaking changes

- The package has dropped dependency on `@itwin/appui-react` and thus no longer sets up any frontstages on behalf of the user. If you wish to continue using AppUI, you will have to create a version comparison frontstage yourself. See our [test-app-frontend](../test-app-frontend/src/App/ITwinJsApp/AppUi/) package for an example.

- Update `ChangedElementsWidget` layout.
- Update search bar style in `ChangedElementsWidget`.
- Expose `ElementList` ref through `ChangedElementsWidget` props.

## 0.1.0

### Minor Changes

#### [0.1.0](https://github.com/iTwin/changed-elements-react/tree/v0.1.0/packages/changed-elements-react) - 2023-06-15

Initial package release.

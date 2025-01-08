# Changelog

## 0.12.0

### Minor Changes

- Added new publish workflow for repository
- Add experimental React component for the new Named Version selector. Its name or API is not stable yet, but you can try it out the following way.

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

- Fix ES module imports not specifying script file extensions
- Fixed model toggle when hide all is on. When hide all is on and a model is toggled on we would show only unchanged elements for that model and not all changed elements for given model.
- Fix the following console warnings in development environment
  - Receiving invalid property when mounting `<ChangedElementsWidget />` with V2 version selector
  - Receiving invalid list ref when displaying changed elements list
  - `checked` checkbox property not being accompanied by `onChange` event handler when rendering element filters popup

## 0.11.3

### Patch Changes

- Fixed emphasized elements(EE) not being respected when version compare is stopped. Now (version compare)VC restores EE that were present before VC is run.

## 0.11.2

### Patch Changes

- Fixed color issues for feedback btn text

## 0.11.1

### Patch Changes

- Fix change report generation failures

## 0.11.0

### Minor Changes

- `JobAndNamedVersions` now exported through the barrel
- `ComparisonJob` models now exported through the barrel

## 0.10.0

### Minor Changes

- `Changed Elements React` removed pseudo-commonjs modules from build output
- `ChangedElementEntryCache` Entries will now be compared and loaded based on cached value not, unchanged current value being check. This prevents an infinite loop.

## 0.9.2

### Patch Changes

- `VersionCompareSelectWidget` V2 will now end the active comparison and start a new one once a new one is triggered instead of doing a no-op on starting a new comparison.

## 0.9.1

### Patch Changes

- `VersionCompareSelectModal` V2 toast now fixed when opening and closing modal.

## 0.9.0

### Minor Changes

- `VersionCompareFeatureTracking` can now be fed to initialization options

## 0.8.0

### Minor Changes

- `VersionCompareSelectModal` V2 now uses paging to load named version resulting in faster load times.
- package updates fixing package vulnerabilities

## 0.7.0

### Minor Changes

- `VersionCompareManager.startComparisonV2`: Invoke `VersionCompareManager.stopComparison` when recovering from error

## 0.6.4

### Patch Changes

- Fixes comparison job error workflow in `VersionCompareSelectModal`. When error jobs are re-run, they delete the existing broken job and re-run a new job for the given job ID.

## 0.6.3

### Patch Changes

- Fixes spurious 409 error in onClick work flow in `ChangedElementsWidget`

## 0.6.2

### Patch Changes

- Fix deleted elements not appearing in `ChangedElementsWidget`

## 0.6.1

### Patch Changes

- Fixed filtering for deleted elements not showing in models
- Fixed display and missing label for deleted elements

## 0.6.0

### Minor Changes

- `VersionCompareManager`: removed the ability to pass a component to v2 widget VC dialog by using the `manageNamedVersionsSlot` setting
- `VersionCompareManager` : Added the ability to filter elements with startComparisonV2 call in the same fashion as startComparisonV1.

## 0.5.0

### Minor Changes

- `VersionCompareManager`: Add ability to hide side-by-side comparison toggle by setting `displaySideBySideToggle` property to `false`
- `VersionCompareManager`: Add ability to pass a component to v2 widget VC dialog by using the `manageNamedVersionsSlot` setting

## 0.4.0

### Minor Changes

- `PropertyComparisonTable`: Add ability to hide side-by-side comparison toggle by setting `displaySideBySideToggle` property to `false`

## 0.3.11

### Patch Changes

- Added new component to modal for handling named versions
- Added ability to make toasts optional and added optional call back for onJobUpdate

## 0.3.10

### Patch Changes

- Callbacks for comparison job progress
- Allow disabling toast messages

## 0.3.8

### Patch Changes

- Fix start changeset inclusion when starting comparison jobs.

## 0.3.7

### Patch Changes

- Use itwinui-react as direct dependency.

## 0.3.6

### Patch Changes

- Export V2 selector dialog.

## 0.3.5

### Patch Changes

- Add functionality for using Changed Elements V2 for visualizing changes.
- Changed Elements Widget now works with V2 when supplied with the new prop `useV2Widget`.

## 0.3.4

### Patch Changes

- You can now check change tracking status by calling `VersionCompare.isChangeTrackingEnabled`.

## 0.3.3

### Patch Changes

- Fix `ReportGeneratorDialog` not listing any changed properties.

## 0.3.2

### Patch Changes

- Reduce likelihood of style clashes for `ExpandableSearchBar` component.
- Replace outdated CSS variables in `ExpandableSearchBar` style rules.

## 0.3.1

### Patch Changes

- Change empty state appearance of `VersionCompareSelectDialog`.
- Improve changed elements widget startup performance by deferring model node loading.

## 0.3.0

### Breaking changes

- `VersionCompare.initialize` no longer accepts `iModelsClient` instance. Instead, you have to supply an object which implements our custom `IModelsClient` interface to `VersionCompareContext`. We expose a default client implementation as `ITwinIModelsClient`.

### Minor Changes

- `VersionCompareSelectDialog` now updates named version list every time it is mounted.
- Remove `@itwin/imodels-client-management` dependency.

### Patch Changes

- Fix `VersionCompareSelectDialog` getting stuck in loading state when there are no named versions present.

## 0.2.0

### Breaking changes

- The package has dropped dependency on `@itwin/appui-react` and thus no longer sets up any frontstages on behalf of the user. If you wish to continue using AppUI, you will have to create a version comparison frontstage yourself. See our [test-app-frontend](../test-app-frontend/src/App/ITwinJsApp/AppUi/) package for an example.

### Minor Changes

- Update `ChangedElementsWidget` layout.
- Update search bar style in `ChangedElementsWidget`.
- Expose `ElementList` ref through `ChangedElementsWidget` props.

## 0.1.0

Initial package release.

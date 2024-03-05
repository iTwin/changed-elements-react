# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.11](https://github.com/iTwin/changed-elements-react/tree/v0.3.11/packages/changed-elements-react) - 2024-03-04

### Patch changes

* Added new component to modal for handling named versions
* Added ability to make toasts optional and added optional call back for onJobUpdate

## [0.3.10](https://github.com/iTwin/changed-elements-react/tree/v0.3.10/packages/changed-elements-react) - 2024-02-26

### Patch changes

* Callbacks for comparison job progress
* Allow disabling toast messages

## [0.3.8](https://github.com/iTwin/changed-elements-react/tree/v0.3.8/packages/changed-elements-react) - 2024-02-14

### Patch changes

* Fix start changeset inclusion when starting comparison jobs.

## [0.3.7](https://github.com/iTwin/changed-elements-react/tree/v0.3.7/packages/changed-elements-react) - 2024-02-14

### Patch changes

* Use itwinui-react as direct dependency.

## [0.3.6](https://github.com/iTwin/changed-elements-react/tree/v0.3.6/packages/changed-elements-react) - 2024-02-13

### Patch changes

* Export V2 selector dialog.

## [0.3.5](https://github.com/iTwin/changed-elements-react/tree/v0.3.5/packages/changed-elements-react) - 2024-02-13

### Patch changes

* Add functionality for using Changed Elements V2 for visualizing changes.
* Changed Elements Widget now works with V2 when supplied with the new prop `useV2Widget`.

## [0.3.4](https://github.com/iTwin/changed-elements-react/tree/v0.3.4/packages/changed-elements-react) - 2023-12-15

### Patch changes

* You can now check change tracking status by calling `VersionCompare.isChangeTrackingEnabled`.

## [0.3.3](https://github.com/iTwin/changed-elements-react/tree/v0.3.3/packages/changed-elements-react) - 2023-10-10

### Fixes

* Fix `ReportGeneratorDialog` not listing any changed properties.

## [0.3.2](https://github.com/iTwin/changed-elements-react/tree/v0.3.2/packages/changed-elements-react) - 2023-09-25

### Patch changes

* Reduce likelihood of style clashes for `ExpandableSearchBar` component.
* Replace outdated CSS variables in `ExpandableSearchBar` style rules.

## [0.3.1](https://github.com/iTwin/changed-elements-react/tree/v0.3.1/packages/changed-elements-react) - 2023-08-31

### Patch changes

* Change empty state appearance of `VersionCompareSelectDialog`.
* Improve changed elements widget startup performance by deferring model node loading.

## [0.3.0](https://github.com/iTwin/changed-elements-react/tree/v0.3.0/packages/changed-elements-react) - 2023-08-14

### Breaking changes

* `VersionCompare.initialize` no longer accepts `iModelsClient` instance. Instead, you have to supply an object which implements our custom `IModelsClient` interface to `VersionCompareContext`. We expose a default client implementation as `ITwinIModelsClient`.

### Minor changes

* `VersionCompareSelectDialog` now updates named version list every time it is mounted.
* Remove `@itwin/imodels-client-management` dependency.

### Fixes

* Fix `VersionCompareSelectDialog` getting stuck in loading state when there are no named versions present.

## [0.2.0](https://github.com/iTwin/changed-elements-react/tree/v0.2.0/packages/changed-elements-react) - 2023-07-20

### Breaking changes

* The package has dropped dependency on `@itwin/appui-react` and thus no longer sets up any frontstages on behalf of the user. If you wish to continue using AppUI, you will have to create a version comparison frontstage yourself. See our [test-app-frontend](../test-app-frontend/src/App/ITwinJsApp/AppUi/) package for an example.

### Minor changes

* Update `ChangedElementsWidget` layout.
* Update search bar style in `ChangedElementsWidget`.
* Expose `ElementList` ref through `ChangedElementsWidget` props.

## [0.1.0](https://github.com/iTwin/changed-elements-react/tree/v0.1.0/packages/changed-elements-react) - 2023-06-15

Initial package release.

# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/iTwin/changed-elements-react/tree/HEAD/packages/changed-elements-react)

### Breaking changes

* `VersionCompare.initialize` no longer accepts `iModelsClient` instance. Instead, you have to supply an object which implements our custom `IModelsClient` interface to `VersionCompareContext`. We expose a default client implementation as `ITwinIModelsClient`.

### Minor changes

* `VersionCompareSelectDialog` now updates named version list every time it is mounted.
* Remove `@itwin/imodels-client-management` dependency.

## [0.2.0](https://github.com/iTwin/changed-elements-react/tree/v0.2.0/packages/changed-elements-react) - 2023-07-20

### Breaking changes

* The package has dropped dependency on `@itwin/appui-react` and thus no longer sets up any frontstages on behalf of the user. If you wish to continue using AppUI, you will have to create a version comparison frontstage yourself. See our [test-app-frontend](../test-app-frontend/src/App/ITwinJsApp/AppUi/) package for an example.

### Minor changes

* Update `ChangedElementsWidget` layout.
* Update search bar style in `ChangedElementsWidget`.
* Expose `ElementList` ref through `ChangedElementsWidget` props.

## [0.1.0](https://github.com/iTwin/changed-elements-react/tree/v0.1.0/packages/changed-elements-react) - 2023-06-15

Initial package release.

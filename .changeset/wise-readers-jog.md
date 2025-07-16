---
"@itwin/changed-elements-react": minor
---

_Frontend Enhancements:_

1. Provide consumers a way to inject their own changes and skip using the changed elements service altogether
2. Provide colorization overrides for any special customization logic
3. Provide a callback when changed instances are selected in the UI

_Backend Enhancements:_
1. Initial ChangesRpcInterface and ChangesRpcImpl which aim to allow using the Partial EC Change Unifier in a simplified way
2. The Rpc interface allows the app to provide relationships that they care about and marks any related changed ec instance with what relationships were affected that may drive the element for changes

See VersionCompare initialization options (`changesProvider`, `colorOverrideProvider` and `onInstancesSelected`) for more information.

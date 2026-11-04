---
"@itwin/changed-elements-react": minor
---

Performance enhancements for big comparison jobs. Improved startup performance. Improved visualization / filtering performance.

API notes: `Provider.visibleChangedElems` is now a `readonly` array; use `setChangedElems()` to replace it. `ChangedElementsManager.changedElements` now returns a snapshot map of the loaded changes rather than the live internal map.
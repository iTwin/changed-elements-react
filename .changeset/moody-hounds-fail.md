---
"@itwin/changed-elements-react": major
---

Add support for Changed Elements API v3 alongside v1/v2.

**Breaking changes:**
- `IComparisonJobClient` now requires `readonly apiVersion: "v2" | "v3"` field. Custom client implementations must add this property.

**New features:**
- `DiffJobClient` class for v3 API (`/diff`) with changeset Id resolution and progress tracking.
- `apiVersion` prop on `ChangedElementsWidget` to select API workflow (v1/v2/v3). Replaces reliance on `useV2Widget`.

**Deprecations:**
- `useV2Widget` prop on `ChangedElementsWidget` is now deprecated in favor of `apiVersion`.

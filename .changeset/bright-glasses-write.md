---
"@itwin/changed-elements-react": patch
---

1. Enhance loading of blobs to be streamed for both V2 and V3
2. If data is too big to reasonably use for property filtering, skip property lists and checksums (supported in both V2 and V3)
3. Check content size to decide whether or not to use minimal representation of changes without property data (V2 Only)
4. Add notification for user to know advanced filtering won't be available if a comparison is too big and property data was skipped

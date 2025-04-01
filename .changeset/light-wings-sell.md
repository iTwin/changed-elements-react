---
"@itwin/changed-elements-react": patch
---

- Fixed Changed Elements React issue where backing out of loading stage sometimes causes crashes. This is fixed by removing ability to backout of loading in experimental widget. This is in parity with how loading operates in the v2 widget.

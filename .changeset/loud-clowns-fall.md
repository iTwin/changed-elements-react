---
"@itwin/changed-elements-react": patch
---

  ### **Performance Issues Fixed:**

  1. **Eliminated massive changeset over-fetching**
     - Previously loaded ALL changesets `[0 -> Inf)` upfront
     - Now uses efficient pagination (20 items at a time)

  2. **Parallelized individual changeset queries**
     - Replaced sequential api calls with more efficient method

  ### **Critical Bug Fixed:**

  3. **Missing index offset for Named Versions**
     - Fixed to properly apply `+1 offset` as required by [Changed Elements API](https://developer.bentley.com/tutorials/changed-elements-api/#221-using-the-api-to-get-changed-elements)

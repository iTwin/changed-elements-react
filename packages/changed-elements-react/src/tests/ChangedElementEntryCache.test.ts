/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";

import { ChangedElementEntryCache, type ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import { mockChangedElementEntry } from "./TestUtilities.js";

describe("ChangedElementEntryCache", () => {
  const withModel = (id: string, modelId?: string, children?: string[]): ChangedElementEntry => ({
    ...mockChangedElementEntry(id),
    modelId,
    children,
  });

  const makeCache = (entries: ChangedElementEntry[]) => {
    const cache = new ChangedElementEntryCache({} as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cache as any)._overrideEntriesInCache(entries);
    return cache;
  };

  it("looks up entries and children by id without scanning the cache", () => {
    const cache = makeCache([
      withModel("0x1", "0xm1", ["0x2", "0x3"]),
      withModel("0x2", "0xm1"),
      withModel("0x3", "0xm2"),
      withModel("0x4", "0xm2"),
    ]);

    expect(cache.getEntries(new Set(["0x1", "0x4", "0xmissing"])).map((e) => e.id)).toEqual(["0x1", "0x4"]);
    expect(cache.getEntries(new Set(["0x1"]), true).map((e) => e.id)).toEqual(["0x1", "0x2", "0x3"]);
  });

  it("keeps the per-model index in sync when entries are added or re-assigned", () => {
    const cache = makeCache([
      withModel("0x1", "0xm1"),
      withModel("0x2", "0xm1"),
      withModel("0x3", "0xm2"),
      withModel("0x4"),
    ]);

    expect(cache.getChangeElementIdsFromModelId("0xm1")).toEqual(new Set(["0x1", "0x2"]));
    expect(cache.getEntriesWithModel("0xm2").map((e) => e.id)).toEqual(["0x3"]);
    expect(cache.getChangeElementIdsFromModelId("0xnone")).toEqual(new Set());

    // Re-assign an element to another model and give a model to one that had none
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cache as any)._overrideEntriesInCache([withModel("0x2", "0xm2"), withModel("0x4", "0xm1")]);
    expect(cache.getChangeElementIdsFromModelId("0xm1")).toEqual(new Set(["0x1", "0x4"]));
    expect(cache.getChangeElementIdsFromModelId("0xm2")).toEqual(new Set(["0x3", "0x2"]));

    cache.cleanup();
    expect(cache.getChangeElementIdsFromModelId("0xm1")).toEqual(new Set());
  });
});

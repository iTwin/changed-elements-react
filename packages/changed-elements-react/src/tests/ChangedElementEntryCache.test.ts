/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, NoRenderApp } from "@itwin/core-frontend";
import { describe, expect, it, vi } from "vitest";

import { ChangedElementEntryCache, ChangeElementType, type ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import { ChangedElementsManager } from "../api/ChangedElementsManager.js";
import { ChangesTreeDataProvider } from "../api/ChangesTreeDataProvider.js";
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
    const map = cache.changedElementEntries;
    const scans = ([Symbol.iterator, "forEach", "values", "entries", "keys"] as const).map((m) => vi.spyOn(map, m));

    expect(cache.getEntries(new Set(["0x1", "0x4", "0xmissing"])).map((e) => e.id)).toEqual(["0x1", "0x4"]);
    expect(cache.getEntries(new Set(["0x1"]), true).map((e) => e.id)).toEqual(["0x1", "0x2", "0x3"]);
    expect(cache.getEntriesWithModel("0xm2").map((e) => e.id)).toEqual(["0x3", "0x4"]);
    scans.forEach((scan) => expect(scan).not.toHaveBeenCalled());
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

  it("keeps per-model order stable when an entry is reloaded without changing model", () => {
    const cache = makeCache([withModel("0x1", "0xm1"), withModel("0x2", "0xm1")]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cache as any)._overrideEntriesInCache([withModel("0x1", "0xm1")], true);
    expect(cache.getEntriesWithModel("0xm1").map((e) => e.id)).toEqual(["0x1", "0x2"]);
  });

  it("resolves a model's root tree nodes without touching its non-root entries", async () => {
    await NoRenderApp.startup();
    try {
      const cache = makeCache([
        { ...withModel("0x1", "0xm1", ["0x2"]), elementType: ChangeElementType.TopAssembly },
        { ...withModel("0x2", "0xm1"), elementType: ChangeElementType.Element },
        { ...withModel("0x3", "0xm2"), elementType: ChangeElementType.TopAssembly },
      ]);
      const perModel = vi.spyOn(cache, "getEntriesWithModel");
      const provider = new ChangesTreeDataProvider({ changedElementsManager: { entryCache: cache } } as never);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodes = (provider as any)._getChangedModelChildrenById("0xm1");
      expect(nodes.map((n: { id: string; }) => n.id)).toEqual(["0x1"]);
      expect(perModel).not.toHaveBeenCalled();
    } finally {
      await IModelApp.shutdown();
    }
  });

  const makeManager = () => {
    const manager = new ChangedElementsManager({} as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (manager.entryCache as any)._overrideEntriesInCache([
      withModel("0x1", "0xm1"),
      { ...withModel("0x2", "0xm1"), indirect: true },
    ]);
    return manager;
  };

  it("excludes manufactured unchanged (indirect) entries from ChangedElementsManager.changedElements", () => {
    expect([...makeManager().changedElements.keys()]).toEqual(["0x1"]);
  });

  it("mutating a returned ChangedElementsManager.changedElements object does not affect cache", () => {
    const manager = makeManager();
    manager.changedElements.set("0x9", withModel("0x9", "0xm1"));
    expect(manager.entryCache.has("0x9")).toBe(false);
    expect(manager.entryCache.getChangeElementIdsFromModelId("0xm1")).toEqual(new Set(["0x1", "0x2"]));
  });
});

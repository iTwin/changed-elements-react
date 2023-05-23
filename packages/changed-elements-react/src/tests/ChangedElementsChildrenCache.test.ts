/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Cartographic } from "@itwin/core-common";
import { BlankConnection, IModelApp, NoRenderApp } from "@itwin/core-frontend";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ChangedElement } from "../api/ChangedElementEntryCache.js";
import { ChangedElementsChildrenCache } from "../api/ChangedElementsChildrenCache.js";
import { iModelMocks, mockChangedElementEntry, QueryStatementMocker } from "./TestUtilities.js";

const mockEntries = [
  mockChangedElementEntry("0x1"),
  mockChangedElementEntry("0x11"),
  mockChangedElementEntry("0x12"),
  mockChangedElementEntry("0x121"),
  mockChangedElementEntry("0x122"),
  mockChangedElementEntry("0x2"),
];

const getParentId = (id: string) => {
  if (id.length === 2) {
    return undefined;
  }

  return id.substring(0, id.length - 1);
};

// Mocker for query calls
const queryMocker: QueryStatementMocker = {
  queryMatch:
    "SELECT ECInstanceId as id, Model as model, ECClassId, ECClassId as classId, Parent as parent FROM Bis.Element child WHERE parent.id in",
  populateRow: (binding: any, row: any) => {
    row.id = binding as string;
    row.className = "Bis.Element";
    row.model = {
      id: "0x10101",
    };
    row.parent = {
      id: getParentId(binding as string),
    };
  },
};

describe("Test ChangedElementsChildrenCache", () => {
  beforeAll(async () => {
    vi.mock("@itwin/core-frontend", async () => {
      const module = await vi.importActual<typeof import("@itwin/core-frontend")>("@itwin/core-frontend");
      const BlankConnection = {
        create: () => ({
          query: iModelMocks.queryMatcherFuncMockGenerator([queryMocker]),
          changeset: { id: "unknown" },
        }),
      };
      return { ...module, BlankConnection };
    });

    await NoRenderApp.startup();
  });

  afterAll(async () => {
    await IModelApp.shutdown();
    vi.restoreAllMocks();
  });

  it("Should be able to find children and fill entries with cache data", async () => {
    // Mock some entries
    const map = new Map<string, ChangedElement>();
    for (const entry of mockEntries) {
      map.set(entry.id, entry);
    }
    const cache = new ChangedElementsChildrenCache(
      BlankConnection.create({ name: "", location: Cartographic.createZero(), extents: [] }),
      BlankConnection.create({ name: "", location: Cartographic.createZero(), extents: [] }),
      map,
    );
    // Populate children in entries
    const filledEntries = await cache.populateEntries(mockEntries);
    // Should have all entries
    expect(filledEntries.length).toBe(mockEntries.length);
    // Ids should match
    for (let i = 0; i < filledEntries.length; ++i) {
      expect(filledEntries[i].id).toBe(mockEntries[i].id);
    }

    // Just for ensuring we are looking at the proper entry in the test
    expect(filledEntries[0].id).toBe("0x1");
    // Should have direct children of 0x1 node
    expect(filledEntries[0].directChildren).toBeDefined();
    // Should have both 0x11 and 0x12 as children
    expect(filledEntries[0].directChildren?.length).toBe(2);
    // Should have all children of 0x1 node
    expect(filledEntries[0].children).toBeDefined();
    // Should have 0x11, 0x12, 0x121 and 0x122 as children
    expect(filledEntries[0].children?.length).toBe(4);

    // Just for ensuring we are looking at the proper entry in the test
    expect(filledEntries[1].id).toBe("0x11");
    // Should have no children
    expect(filledEntries[1].directChildren).toBeDefined();
    expect(filledEntries[1].directChildren?.length).toBe(0);
    expect(filledEntries[1].children).toBeDefined();
    expect(filledEntries[1].children?.length).toBe(0);

    // Just for ensuring we are looking at the proper entry in the test
    expect(filledEntries[2].id).toBe("0x12");
    // Should have direct children of 0x12 node
    expect(filledEntries[2].directChildren).toBeDefined();
    // Should have both 0x121 and 0x122 as children
    expect(filledEntries[2].directChildren?.length).toBe(2);
    // Should have all children of 0x12 node
    expect(filledEntries[2].children).toBeDefined();
    // Should have 0x121 and 0x122 as children
    expect(filledEntries[2].children?.length).toBe(2);

    // Just for ensuring we are looking at the proper entry in the test
    expect(filledEntries[3].id).toBe("0x121");
    // Should have no children
    expect(filledEntries[3].directChildren).toBeDefined();
    expect(filledEntries[3].directChildren?.length).toBe(0);
    expect(filledEntries[3].children).toBeDefined();
    expect(filledEntries[3].children?.length).toBe(0);

    // Just for ensuring we are looking at the proper entry in the test
    expect(filledEntries[4].id).toBe("0x122");
    // Should have no children
    expect(filledEntries[4].directChildren).toBeDefined();
    expect(filledEntries[4].directChildren?.length).toBe(0);
    expect(filledEntries[4].children).toBeDefined();
    expect(filledEntries[4].children?.length).toBe(0);

    // Just for ensuring we are looking at the proper entry in the test
    expect(filledEntries[5].id).toBe("0x2");
    // Should have no children
    expect(filledEntries[5].directChildren).toBeDefined();
    expect(filledEntries[5].directChildren?.length).toBe(0);
    expect(filledEntries[5].children).toBeDefined();
    expect(filledEntries[5].children?.length).toBe(0);

    // Ensure cache maintained all entries by their ids
    expect(cache.has("0x1")).toBe(true);
    expect(cache.has("0x12")).toBe(true);
    expect(cache.has("0x11")).toBe(true);
    expect(cache.has("0x121")).toBe(true);
    expect(cache.has("0x122")).toBe(true);
    expect(cache.has("0x2")).toBe(true);

    // Should not have children ids of an id that wasn't processed
    expect(cache.getAllChildrenIds("0x3")).toBeUndefined();
    // Should have all children of 0x1
    const childrenOf0x1 = cache.getAllChildrenIds("0x1");
    expect(childrenOf0x1).toBeDefined();
    expect(childrenOf0x1?.length).toBe(4);
    const childrenOf0x1Set = new Set(childrenOf0x1);
    expect(childrenOf0x1Set.has("0x11")).toBe(true);
    expect(childrenOf0x1Set.has("0x12")).toBe(true);
    expect(childrenOf0x1Set.has("0x121")).toBe(true);
    expect(childrenOf0x1Set.has("0x122")).toBe(true);
    // Should have direct children of 0x1
    const directChildren0x1 = cache.getDirectChildrenIds("0x1");
    expect(directChildren0x1).toBeDefined();
    expect(directChildren0x1?.length).toBe(2);
    const directChildren0x1Set = new Set(directChildren0x1);
    expect(directChildren0x1Set.has("0x11")).toBe(true);
    expect(directChildren0x1Set.has("0x12")).toBe(true);

    // Should have all children of 0x12
    const childrenOf0x12 = cache.getAllChildrenIds("0x12");
    expect(childrenOf0x12).toBeDefined();
    expect(childrenOf0x12?.length).toBe(2);
    const childrenOf0x12Set = new Set(childrenOf0x12);
    expect(childrenOf0x12Set.has("0x121")).toBe(true);
    expect(childrenOf0x12Set.has("0x122")).toBe(true);
    // Should have direct children of 0x12
    const directChildrenOf0x12 = cache.getAllChildrenIds("0x12");
    expect(directChildrenOf0x12).toBeDefined();
    expect(directChildrenOf0x12?.length).toBe(2);
    const directChildrenOf0x12Set = new Set(directChildrenOf0x12);
    expect(directChildrenOf0x12Set.has("0x121")).toBe(true);
    expect(directChildrenOf0x12Set.has("0x122")).toBe(true);
  });
});

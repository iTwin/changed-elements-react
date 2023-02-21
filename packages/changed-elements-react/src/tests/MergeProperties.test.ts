/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { TypeOfChange } from "@itwin/core-common";
import { describe, expect, it } from "vitest";

import type { ChangedElement, Checksums } from "../api/ChangedElementEntryCache";
import { cleanMergedElements, mergeProperties } from "../api/ChangedElementsManager";

describe("Merge properties test", () => {
  it("Properties and checksums should be merged properly", () => {
    // Changeset without any property change
    const emptyChangeset = new Map<string, Checksums>();
    // First changeset's props
    const changeset0 = new Map<string, Checksums>();
    // Change Prop0
    changeset0.set("Prop0", {
      newChecksum: 1,
      oldChecksum: 0,
    });
    // Second changeset's props
    const changeset1 = new Map<string, Checksums>();
    // Update Prop0
    changeset1.set("Prop0", {
      newChecksum: 2,
      oldChecksum: 1,
    });
    // Change Prop1
    changeset1.set("Prop1", {
      newChecksum: 1,
      oldChecksum: 0,
    });
    // Thid changeset's props
    const changeset2 = new Map<string, Checksums>();
    // Update Prop0
    changeset2.set("Prop0", {
      newChecksum: 3,
      oldChecksum: 2,
    });
    // Change Prop2
    changeset2.set("Prop2", {
      newChecksum: 1,
      oldChecksum: 0,
    });

    // Test merging properties with an empty changeset
    let changeset1WithEmpty = mergeProperties(changeset1, emptyChangeset);
    // Should have Prop0 and checksums should match
    expect(changeset1WithEmpty.has("Prop0")).toBe(true);
    expect(changeset1WithEmpty.get("Prop0")?.newChecksum).toBe(2);
    expect(changeset1WithEmpty.get("Prop0")?.oldChecksum).toBe(1);
    // Try merging it in different order
    changeset1WithEmpty = mergeProperties(emptyChangeset, changeset1);
    // Should have same result
    expect(changeset1WithEmpty.has("Prop0")).toBe(true);
    expect(changeset1WithEmpty.get("Prop0")?.newChecksum).toBe(2);
    expect(changeset1WithEmpty.get("Prop0")?.oldChecksum).toBe(1);

    // Test merging properties how we would during a version compare accumulation
    const changeset0and1 = mergeProperties(changeset1, changeset0);
    let allChangesets = mergeProperties(changeset2, changeset0and1);

    // Check results
    // Properties should all exist
    expect(allChangesets.has("Prop0")).toBe(true);
    expect(allChangesets.has("Prop1")).toBe(true);
    expect(allChangesets.has("Prop2")).toBe(true);
    // Prop0 newest checksum was 3
    expect(allChangesets.get("Prop0")?.newChecksum).toBe(3);
    // Prop0 oldest checksum was 0
    expect(allChangesets.get("Prop0")?.oldChecksum).toBe(0);
    // Prop1 newest checksum was 1
    expect(allChangesets.get("Prop1")?.newChecksum).toBe(1);
    // Prop1 oldest checksum was 0
    expect(allChangesets.get("Prop1")?.oldChecksum).toBe(0);
    // Prop2 newest checksum was 1
    expect(allChangesets.get("Prop2")?.newChecksum).toBe(1);
    // Prop2 oldest checksum was 0
    expect(allChangesets.get("Prop2")?.oldChecksum).toBe(0);

    // Test with an empty properties changeset in between
    const afterEmpty = mergeProperties(emptyChangeset, changeset0and1);
    allChangesets = mergeProperties(changeset2, afterEmpty);

    // Check results, should be the same with the added empty changeset
    // Properties should all exist
    expect(allChangesets.has("Prop0")).toBe(true);
    expect(allChangesets.has("Prop1")).toBe(true);
    expect(allChangesets.has("Prop2")).toBe(true);
    // Prop0 newest checksum was 3
    expect(allChangesets.get("Prop0")?.newChecksum).toBe(3);
    // Prop0 oldest checksum was 0
    expect(allChangesets.get("Prop0")?.oldChecksum).toBe(0);
    // Prop1 newest checksum was 1
    expect(allChangesets.get("Prop1")?.newChecksum).toBe(1);
    // Prop1 oldest checksum was 0
    expect(allChangesets.get("Prop1")?.oldChecksum).toBe(0);
    // Prop2 newest checksum was 1
    expect(allChangesets.get("Prop2")?.newChecksum).toBe(1);
    // Prop2 oldest checksum was 0
    expect(allChangesets.get("Prop2")?.oldChecksum).toBe(0);
  });

  it("Properties should disappear if they have same checksum between ranges", () => {
    // First changeset's props
    const changeset0 = new Map<string, Checksums>();
    // Change Prop0
    changeset0.set("Prop0", {
      newChecksum: 1,
      oldChecksum: 0,
    });
    // Second changeset's props
    const changeset1 = new Map<string, Checksums>();
    // Change Prop0 back to 0 checksum
    changeset1.set("Prop0", {
      newChecksum: 0,
      oldChecksum: 1,
    });
    // Second changeset's props
    const changeset2 = new Map<string, Checksums>();
    // Change Prop0 to new checksum 5
    changeset2.set("Prop0", {
      newChecksum: 5,
      oldChecksum: 0,
    });

    // Should not have properties after this one, because it flipped back and forth
    const changeset0and1 = mergeProperties(changeset1, changeset0);
    expect(changeset0and1.has("Prop0")).toBe(false);
    expect(changeset0and1.size).toBe(0);

    // Should have checksum 5 at the end of merging all changes
    const allChangesets = mergeProperties(changeset2, changeset0and1);
    expect(allChangesets.has("Prop0")).toBe(true);
    expect(allChangesets.get("Prop0")?.newChecksum).toBe(5);
    expect(allChangesets.get("Prop0")?.oldChecksum).toBe(0);
  });

  it("Test cleanMergedElements", () => {
    // Test map
    const changedElements = new Map<string, ChangedElement>();
    // First element:
    // Test that this element that has an empty property map
    // (which may be caused by flipping property values back and forth to the same value)
    // will be removed from the changed elements map when calling cleanMergedElements
    changedElements.set("0x1", {
      id: "0x1",
      classId: "0xc1",
      opcode: DbOpcode.Update,
      properties: new Map<string, Checksums>(),
      type: TypeOfChange.Indirect | TypeOfChange.Property,
    });
    // Second element:
    // Proper updated element with changed properties
    const propMap = new Map<string, Checksums>();
    propMap.set("Property1", {
      newChecksum: 1,
      oldChecksum: 0,
    });
    changedElements.set("0x2", {
      id: "0x2",
      classId: "0xc2",
      opcode: DbOpcode.Update,
      properties: propMap,
      type: TypeOfChange.Indirect | TypeOfChange.Property,
    });
    // Third element:
    // Added element, shouldn't be touched by cleanMergedElements
    changedElements.set("0x3", {
      id: "0x3",
      classId: "0xc3",
      opcode: DbOpcode.Insert,
      type: 0,
    });
    // Fourth element:
    // Deleted element, shouldn't be touched by cleanMergedElements
    changedElements.set("0x4", {
      id: "0x4",
      classId: "0xc4",
      opcode: DbOpcode.Delete,
      type: 0,
    });

    // Clean the map
    cleanMergedElements(changedElements);

    // Should have cleaned up the element that ended up with no properties
    expect(changedElements.has("0x1")).toBeFalsy();
    // All other elements should remain in the map
    expect(changedElements.has("0x2")).toBeTruthy();
    expect(changedElements.has("0x3")).toBeTruthy();
    expect(changedElements.has("0x3")).toBeTruthy();
  });
});

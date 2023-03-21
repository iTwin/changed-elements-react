/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { TypeOfChange, type ChangedElements } from "@itwin/core-common";
import { describe, expect, it } from "vitest";

import type { ChangedElement } from "../api/ChangedElementEntryCache.js";
import { accumulateChanges } from "../api/ChangedElementsManager.js";

const changeset1: ChangedElements = {
  elements: ["0x1", "0x2"],
  classIds: ["0xc1", "0xc2"],
  opcodes: [DbOpcode.Insert, DbOpcode.Insert],
  type: [TypeOfChange.Property, TypeOfChange.Property],
  modelIds: ["0x100", "0x200"],
  properties: [[], []],
};
const changeset2: ChangedElements = {
  elements: ["0x1", "0x2"],
  classIds: ["0xc1", "0xc2"],
  opcodes: [DbOpcode.Update, DbOpcode.Update],
  type: [TypeOfChange.Property, TypeOfChange.Property],
  modelIds: ["0x101", "0x200"],
  properties: [["Property1", "Property2"], ["Property1"]],
};
const changeset3: ChangedElements = {
  elements: ["0x1", "0x2"],
  classIds: ["0xc1", "0xc2"],
  opcodes: [DbOpcode.Update, DbOpcode.Update],
  type: [TypeOfChange.Property, TypeOfChange.Geometry | TypeOfChange.Placement],
  modelIds: ["0x100", "0x200"],
  properties: [["Property3"], []],
};

const insertDeleteCs1: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Insert],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [[]],
};
const insertDeleteCs2: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Delete],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [[]],
};

const insertInsertCs1: ChangedElements = {
  elements: ["0x1", "0x2"],
  classIds: ["0xc1", "0xc2"],
  opcodes: [DbOpcode.Insert, DbOpcode.Update],
  type: [TypeOfChange.Property, TypeOfChange.Property],
  modelIds: ["0x100", "0x100"],
  properties: [[], []],
};
const insertInsertCs2: ChangedElements = {
  elements: ["0x1", "0x2"],
  classIds: ["0xc1", "0xc2"],
  opcodes: [DbOpcode.Insert, DbOpcode.Insert],
  type: [TypeOfChange.Property, TypeOfChange.Property],
  modelIds: ["0x100", "0x100"],
  properties: [[], []],
};

const deleteInsertCs1: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Delete],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [[]],
};
const deleteInsertCs2: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Insert],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [[]],
};

// For property and checksum merging testing
// Update to Property1
const propertyCs3: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Update],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [["Property1"]],
  newChecksums: [[100]],
  oldChecksums: [[90]],
};
// Update to Property1
const propertyCs2: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Update],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [["Property1"]],
  newChecksums: [[90]],
  oldChecksums: [[80]],
};
// Element was inserted
const propertyCs1: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Insert],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [[]],
  newChecksums: [[]],
  oldChecksums: [[]],
};
// Element was updated
const propertyCs12: ChangedElements = {
  elements: ["0x1"],
  classIds: ["0xc1"],
  opcodes: [DbOpcode.Update],
  type: [TypeOfChange.Property],
  modelIds: ["0x100"],
  properties: [["Property1"]],
  newChecksums: [[80]],
  oldChecksums: [[100]],
};

describe("Accumulate change test", () => {
  it("Changed elements should accumulate properly", () => {
    // Accumulate changesets 1 and 2
    // Elements got inserted in changeset 1, so we should end up with insertions
    const map = new Map<string, ChangedElement>();
    accumulateChanges(map, changeset2);
    accumulateChanges(map, changeset1);

    // Should have both elements processed
    expect(map.has("0x1")).toBe(true);
    expect(map.has("0x2")).toBe(true);

    // Check expected results for 0x1
    const data1 = map.get("0x1");
    expect(data1?.id).toBe("0x1");
    expect(data1?.classId).toBe("0xc1");
    // Insert + Update should data1 in Insert
    expect(data1?.opcode).toBe(DbOpcode.Insert);
    // Properties should be overridden as undefined since element got inserted
    expect(data1?.properties).toBeUndefined();
    // Accumulation should have kept the newest model Id
    expect(data1?.modelId).toBe("0x101");
    // Accumulation should have kept the type of change in the second changeset
    expect(data1?.type).toBe(TypeOfChange.Property);

    // Check expected results for 0x2
    const data2 = map.get("0x2");
    expect(data2?.id).toBe("0x2");
    expect(data2?.classId).toBe("0xc2");
    // Insert + Update should result in Insert
    expect(data2?.opcode).toBe(DbOpcode.Insert);
    // Properties should be overridden as undefined since element got inserted
    expect(data2?.properties).toBeUndefined();
    // Accumulation should have kept the newest model Id
    expect(data2?.modelId).toBe("0x200");
    // Accumulation should have kept the type of change in the second changeset
    expect(data2?.type).toBe(TypeOfChange.Property);

    // Try changeset 3 + changeset 2
    map.clear();
    accumulateChanges(map, changeset3);
    accumulateChanges(map, changeset2);

    // Should have both elements processed
    expect(map.has("0x1")).toBe(true);
    expect(map.has("0x2")).toBe(true);

    // Check expected results for 0x1
    const data12 = map.get("0x1");
    // Should have proper id and class id
    expect(data12?.id).toBe("0x1");
    expect(data12?.classId).toBe("0xc1");
    // Update + Update = Update
    expect(data12?.opcode).toBe(DbOpcode.Update);
    // Should have accumulated all different properties (Property1, Property2 and Property3)
    expect(data12?.properties?.size).toBe(3);
    expect(data12?.properties?.has("Property1")).toBe(true);
    expect(data12?.properties?.has("Property2")).toBe(true);
    expect(data12?.properties?.has("Property3")).toBe(true);
    // Should still have the same type of change
    expect(data12?.type).toBe(TypeOfChange.Property);

    // Check expected results for 0x2
    const data22 = map.get("0x2");
    // Should have proper id and class id
    expect(data22?.id).toBe("0x2");
    expect(data22?.classId).toBe("0xc2");
    // Update + Update = Update
    expect(data22?.opcode).toBe(DbOpcode.Update);
    // Should have accumulated all different properties (Property1)
    expect(data22?.properties?.size).toBe(1);
    expect(data22?.properties?.has("Property1")).toBe(true);
    // Type of change should have been accumulated properly
    expect(data22?.type).toBe(TypeOfChange.Property | TypeOfChange.Geometry | TypeOfChange.Placement);
  });

  it("Insert/Update + Insert should be maintained as insert/update to handle overflow tables", () => {
    // Accumulate two changesets in which the same element got inserted and then deleted
    let map = new Map<string, ChangedElement>();
    accumulateChanges(map, insertInsertCs2);
    accumulateChanges(map, insertInsertCs1);
    expect(map.size).toBe(2);
    expect(map.has("0x1")).toBe(true);
    expect(map.has("0x2")).toBe(true);
    // Should be kept as insert
    expect(map.get("0x1")?.opcode).toBe(DbOpcode.Insert);
    // Should be treated as kept update
    expect(map.get("0x2")?.opcode).toBe(DbOpcode.Update);

    // Test forward
    map = new Map<string, ChangedElement>();
    accumulateChanges(map, insertInsertCs1, true);
    accumulateChanges(map, insertInsertCs2, true);
    expect(map.size).toBe(2);
    expect(map.has("0x1")).toBe(true);
    expect(map.has("0x2")).toBe(true);
    // Should be kept as insert
    expect(map.get("0x1")?.opcode).toBe(DbOpcode.Insert);
    // Should be treated as kept update
    expect(map.get("0x2")?.opcode).toBe(DbOpcode.Update);
  });

  it("Delete + Insert should be maintained as update to handle overflow tables", () => {
    // Accumulate two changesets in which the same element got inserted and then deleted
    let map = new Map<string, ChangedElement>();
    accumulateChanges(map, deleteInsertCs2);
    accumulateChanges(map, deleteInsertCs1);
    expect(map.size).toBe(1);
    expect(map.has("0x1")).toBe(true);
    // Should be kept as insert
    expect(map.get("0x1")?.opcode).toBe(DbOpcode.Update);

    // Test forward
    map = new Map<string, ChangedElement>();
    accumulateChanges(map, deleteInsertCs1, true);
    accumulateChanges(map, deleteInsertCs2, true);
    expect(map.size).toBe(1);
    expect(map.has("0x1")).toBe(true);
    // Should be kept as insert
    expect(map.get("0x1")?.opcode).toBe(DbOpcode.Update);
  });

  it("Insert + Delete should result in no change", () => {
    // Accumulate two changesets in which the same element got inserted and then deleted
    const map = new Map<string, ChangedElement>();
    accumulateChanges(map, insertDeleteCs2);
    accumulateChanges(map, insertDeleteCs1);
    expect(map.has("0x1")).toBe(false);
    expect(map.size).toBe(0);
  });

  it("Test property merging backwards", () => {
    // Accumulate two changesets in which the same element's properties got updated
    const map = new Map<string, ChangedElement>();
    accumulateChanges(map, propertyCs3, false);
    accumulateChanges(map, propertyCs2, false);
    expect(map.has("0x1")).toBe(true);
    expect(map.size).toBe(1);
    const element = map.get("0x1");
    // Should have the property
    expect(element?.properties?.has("Property1")).toBe(true);
    const checksums = element?.properties?.get("Property1");
    expect(checksums).toBeDefined();
    // Should have newest checksum 100 and oldest checksum 80
    expect(checksums?.newChecksum).toBe(100);
    expect(checksums?.oldChecksum).toBe(80);
  });

  it("Test property merging forwards", () => {
    // Accumulate two changesets in which the same element's properties got updated
    const map = new Map<string, ChangedElement>();
    accumulateChanges(map, propertyCs2, true);
    accumulateChanges(map, propertyCs3, true);
    expect(map.has("0x1")).toBe(true);
    expect(map.size).toBe(1);
    const element = map.get("0x1");
    // Should have the property
    expect(element?.properties?.has("Property1")).toBe(true);
    const checksums = element?.properties?.get("Property1");
    expect(checksums).toBeDefined();
    // Should have newest checksum 100 and oldest checksum 80
    expect(checksums?.newChecksum).toBe(100);
    expect(checksums?.oldChecksum).toBe(80);
  });

  it("Test property merging is disregarded when element was found added", () => {
    // Accumulate two changesets in which the same element's properties got updated
    const map = new Map<string, ChangedElement>();
    accumulateChanges(map, propertyCs3);
    accumulateChanges(map, propertyCs2);
    accumulateChanges(map, propertyCs1);
    expect(map.has("0x1")).toBe(true);
    expect(map.size).toBe(1);
    const element = map.get("0x1");
    // Should not care about the property since element was inserted in the range
    expect(element!.properties).toBeUndefined();
  });

  it("Test property merging removes the property if checksums are the same", () => {
    // Accumulate two changesets in which the same element's properties got updated to the same value overall
    const map = new Map<string, ChangedElement>();
    accumulateChanges(map, propertyCs3);
    accumulateChanges(map, propertyCs2);
    accumulateChanges(map, propertyCs12);
    expect(map.has("0x1")).toBe(true);
    expect(map.size).toBe(1);
    const element = map.get("0x1");
    // Property should not show because the checksums for oldest vs newest are the same
    expect(element?.properties?.has("Property1")).toBe(false);
    expect(element?.properties?.size).toBe(0);
  });
});

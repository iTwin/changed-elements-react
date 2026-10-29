/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { TypeOfChange } from "@itwin/core-common";
import { describe, expect, it } from "vitest";

import { accumulateChanges } from "../api/ChangedElementsManager.js";
import { largePayloadThresholdBytes, parseJsonResponse, readChangedElementsPayload } from "../clients/common.js";
import { isChangedElementsPayload } from "../clients/typeGuards.js";

const payload = {
  changedElements: {
    elements: ["0x1", "0x2"],
    classIds: ["0xa", "0xb"],
    opcodes: [DbOpcode.Update, DbOpcode.Update],
    type: [TypeOfChange.Property, TypeOfChange.Geometry],
    modelIds: ["0x10", "0x10"],
    properties: [["Name", "Esc\"aped\\"], []],
    oldChecksums: [[1.5, -2e3], []],
    newChecksums: [[true, null], []],
    parentIds: ["0", "0x1"],
    parentClassIds: ["0", "0xa"],
  },
};

/** Streams `text` in fixed-size chunks so tokens get split across reads. */
function streamed(text: string, chunkSize: number, headers?: Record<string, string>): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }

      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(body, { headers });
}

describe("parseJsonResponse", () => {
  const text = JSON.stringify(payload);

  it("reassembles tokens split across arbitrary chunk boundaries", async () => {
    for (const chunkSize of [1, 3, 7, text.length]) {
      expect(await parseJsonResponse(streamed(text, chunkSize))).toEqual(payload);
    }
  });

  it("discards omitted keys without materializing them", async () => {
    const result = await parseJsonResponse(streamed(text, 5), new Set(["properties", "oldChecksums"]));
    const { properties, oldChecksums, ...rest } = payload.changedElements;
    expect(result).toEqual({ changedElements: rest });
    expect([properties, oldChecksums]).toBeDefined();
  });

  it("rejects truncated input", async () => {
    await expect(parseJsonResponse(streamed(text.slice(0, -3), 4))).rejects.toThrow("Unexpected end of JSON input");
  });
});

describe("readChangedElementsPayload", () => {
  const text = JSON.stringify(payload);

  it("keeps everything for normal payloads", async () => {
    const result = await readChangedElementsPayload(streamed(text, 8), isChangedElementsPayload);
    expect(result).toEqual(payload);
  });

  it("drops properties and checksums for oversized payloads but keeps the Property type bit", async () => {
    const headers = { "Content-Length": String(largePayloadThresholdBytes + 1) };
    const result = await readChangedElementsPayload(streamed(text, 8, headers), isChangedElementsPayload);
    expect(result.changedElements.propertiesOmitted).toBe(true);
    expect(result.changedElements.properties).toBeUndefined();
    expect(result.changedElements.oldChecksums).toBeUndefined();
    expect(result.changedElements.newChecksums).toBeUndefined();
    expect(result.changedElements.elements).toEqual(payload.changedElements.elements);

    const accumulated = new Map();
    accumulateChanges(accumulated, result.changedElements);
    expect(accumulated.get("0x1")?.type).toBe(TypeOfChange.Property);
    expect(accumulated.get("0x1")?.properties).toBeUndefined();

    // Without the flag, missing properties still strip the Property bit.
    const legacy = new Map();
    accumulateChanges(legacy, { ...result.changedElements, propertiesOmitted: undefined });
    expect(legacy.get("0x1")?.type).toBe(0);
  });
});

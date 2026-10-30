/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComparisonJobClient } from "../clients/ComparisonJobClient.js";
import { largePayloadThresholdBytes } from "../clients/common.js";
import type { ComparisonJobCompleted } from "../clients/IComparisonJobClient.js";

const fullHref = "https://blob.test/full?sas";
const minimalHref = "https://blob.test/minimal?sas";
const fullBody = { changedElements: { elements: ["0x1"], classIds: ["0xa"], opcodes: [23], type: [1], modelIds: ["0x2"], properties: [["Name"]] } };
const minimalBody = { changedElements: { elements: ["0x1"], classIds: ["0xa"], opcodes: [23], type: [1], modelIds: ["0x2"] } };

const job = (href: string) => ({
  comparisonJob: { jobId: "job-1", iTwinId: "itwin-1", iModelId: "imodel-1", status: "Completed", comparison: { href } },
});

function jsonResponse(body: unknown, contentLength?: number): Response {
  const text = JSON.stringify(body);
  const headers = new Headers({ "Content-Length": String(contentLength ?? text.length) });
  const response = new Response(text, { headers });
  if (response.body) {
    vi.spyOn(response.body, "cancel");
  }
  return response;
}

describe("ComparisonJobClient.getComparisonJobResult", () => {
  const client = new ComparisonJobClient({ baseUrl: "https://api.test", getAccessToken: async () => "token" });
  const completed = job(fullHref) as ComparisonJobCompleted;

  afterEach(() => vi.restoreAllMocks());

  it("loads the full blob when it is small enough", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(fullBody));
    const result = await client.getComparisonJobResult({ comparisonJob: completed.comparisonJob });
    expect(result.changedElements.properties).toEqual([["Name"]]);
    expect(result.changedElements.propertiesOmitted).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("switches to the minimal blob when the full blob is too large", async () => {
    const full = jsonResponse(fullBody, largePayloadThresholdBytes + 1);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === fullHref) {
        return full;
      }
      if (url === minimalHref) {
        return jsonResponse(minimalBody);
      }
      expect(url).toContain("/comparisonJob/job-1/iTwin/itwin-1/iModel/imodel-1");
      expect(new Headers(init?.headers).get("Prefer")).toBe("return=minimal");
      return jsonResponse(job(minimalHref));
    });

    const result = await client.getComparisonJobResult({ comparisonJob: completed.comparisonJob });
    expect(result.changedElements.propertiesOmitted).toBe(true);
    expect(result.changedElements.properties).toBeUndefined();
    expect(result.changedElements.elements).toEqual(["0x1"]);
    expect(full.body?.cancel).toHaveBeenCalled();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain(minimalHref);
  });

  it("falls back to dropping properties from the full blob when no minimal blob exists", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      return String(input) === fullHref
        ? jsonResponse(fullBody, largePayloadThresholdBytes + 1)
        : new Response("nope", { status: 500 });
    });

    const result = await client.getComparisonJobResult({ comparisonJob: completed.comparisonJob });
    expect(result.changedElements.propertiesOmitted).toBe(true);
    expect(result.changedElements.properties).toBeUndefined();
    expect(result.changedElements.elements).toEqual(["0x1"]);
  });
});

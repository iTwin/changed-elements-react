/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterEach, beforeAll, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { callITwinApi, CommonRequestArgs } from "./callITwinApi";
import { getChangesets, getComparison, GetComparisonResult, getTracking, Opcode, putTracking, PutTrackingArgs, TypeOfChange } from "./changedElementsApi";

beforeAll(() => {
  vi.mock("./callITwinApi", () => ({ callITwinApi: vi.fn() }));
});

afterEach(() => {
  (callITwinApi as Mock).mockReset();
});

const commonArgs: CommonRequestArgs = { accessToken: "", baseUrl: "http://test" };

describe("getTracking", () => {
  it("builds correct fetch arguments and parses the result", async () => {
    (callITwinApi as Mock).mockReturnValue({ json: () => ({ enabled: false }) });
    const result = await getTracking({ iTwinId: "TestITwin", iModelId: "TestIModel" }, commonArgs);
    expect(result).toStrictEqual({ enabled: false });
    expect(callITwinApi).toHaveBeenCalledOnce();
    expect(callITwinApi)
      .toHaveBeenCalledWith({ endpoint: "/tracking?iTwinId=TestITwin&iModelId=TestIModel" }, commonArgs);
  });
});

describe("putTracking", () => {
  it("builds correct fetch arguments", async () => {
    await putTracking(
      { iTwinId: "TestITwin", iModelId: "TestIModel", enable: true, unrelatedProperty: true } as PutTrackingArgs,
      commonArgs,
    );
    expect(callITwinApi).toHaveBeenCalledOnce();
    expect(callITwinApi).toHaveBeenCalledWith(
      { endpoint: "/tracking", method: "PUT", body: { iTwinId: "TestITwin", iModelId: "TestIModel", enable: true } },
      commonArgs,
    );
  });
});

describe("getChangesets", () => {
  beforeEach(() => {
    (callITwinApi as Mock).mockReturnValue({ json: () => ({ changesetStatus: [] }) });
  });

  it("builds correct fetch arguments and parses the result", async () => {
    const result = await getChangesets({ iTwinId: "TestITwin", iModelId: "TestIModel" }, commonArgs);
    expect(result).toStrictEqual({ changesetStatus: [] });
    expect(callITwinApi).toHaveBeenCalledOnce();
    expect(callITwinApi)
      .toHaveBeenCalledWith({ endpoint: "/changesets?iTwinId=TestITwin&iModelId=TestIModel" }, commonArgs);
  });

  it("allows trimming the result set", async () => {
    await getChangesets({ iTwinId: "TestITwin", iModelId: "TestIModel", top: 1 }, commonArgs);
    expect(callITwinApi).toHaveBeenCalledOnce();
    expect(callITwinApi)
      .toHaveBeenCalledWith({ endpoint: "/changesets?iTwinId=TestITwin&iModelId=TestIModel&top=1" }, commonArgs);
  });

  it("allows skipping items in the result set", async () => {
    await getChangesets({ iTwinId: "TestITwin", iModelId: "TestIModel", skip: 1 }, commonArgs);
    expect(callITwinApi).toHaveBeenCalledOnce();
    expect(callITwinApi)
      .toHaveBeenCalledWith({ endpoint: "/changesets?iTwinId=TestITwin&iModelId=TestIModel&skip=1" }, commonArgs);
  });

  it("allows trimming and skipping items in the result set", async () => {
    await getChangesets({ iTwinId: "TestITwin", iModelId: "TestIModel", top: 1, skip: 1 }, commonArgs);
    expect(callITwinApi).toHaveBeenCalledOnce();
    expect(callITwinApi)
      .toHaveBeenCalledWith({ endpoint: "/changesets?iTwinId=TestITwin&iModelId=TestIModel&top=1&skip=1" }, commonArgs);
  });
});

describe("getComparison", () => {
  it("builds correct fetch arguments and parses the result", async () => {
    const responseObject: GetComparisonResult = {
      changedElements: {
        elements: [""],
        classIds: [""],
        modelIds: [""],
        parentIds: [""],
        parentClassIds: [""],
        opcodes: [Opcode.Delete],
        type: [TypeOfChange.Geometry],
        properties: [[""]],
        oldChecksums: [[0]],
        newChecksums: [[0]],
      },
    };
    (callITwinApi as Mock).mockReturnValue({ json: () => responseObject });
    const result = await getComparison(
      {
        iTwinId: "TestITwin",
        iModelId: "TestIModel",
        startChangesetId: "start",
        endChangesetId: "end",
      },
      commonArgs,
    );
    expect(result).toStrictEqual(responseObject);
    expect(callITwinApi).toHaveBeenCalledOnce();
    expect(callITwinApi).toHaveBeenCalledWith(
      { endpoint: "/comparison?iTwinId=TestITwin&iModelId=TestIModel&startChangesetId=start&endChangesetId=end" },
      commonArgs,
    );
  });
});

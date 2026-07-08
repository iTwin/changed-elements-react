/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiffJobClient } from "../clients/DiffJobClient.js";
import type { IModelsClient } from "../clients/iModelsClient.js";

const createChangeset = (id: string, index: number) => ({
  id,
  index,
  displayName: `changeset-${index}`,
  description: "",
  parentId: "",
  creatorId: "",
  pushDateTime: "",
});

describe("DiffJobClient", () => {
  const iTwinId = "a1b2c3d4-0000-0000-0000-000000000000";
  const iModelId = "b1b2c3d4-0000-0000-0000-000000000000";
  const startChangesetId = "11111111-1111-4111-8111-111111111111";
  const endChangesetId = "22222222-2222-4222-8222-222222222222";

  const iModelsClient = {
    getChangesets: vi.fn(),
    getNamedVersions: vi.fn(),
    getChangeset: vi.fn(),
  } as unknown as IModelsClient;

  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(iModelsClient.getChangeset).mockReset();
    vi.mocked(iModelsClient.getChangesets).mockReset();
    vi.mocked(iModelsClient.getNamedVersions).mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts v3 diff jobs using VersionCompare strategy and changeset indexes", async () => {
    vi.mocked(iModelsClient.getChangeset)
      .mockResolvedValueOnce(createChangeset(startChangesetId, 4))
      .mockResolvedValueOnce(createChangeset(endChangesetId, 8));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "VersionCompare" },
      },
    }), { status: 202 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
      diffingStrategy: "VersionCompare",
    });

    const result = await client.postComparisonJob({
      iTwinId,
      iModelId,
      startChangesetId,
      endChangesetId,
      headers: { "Content-Type": "application/json" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(request.body as string) as {
      startChangesetIndex: number;
      endChangesetIndex: number;
      diffingPlan: { strategy: string; };
    };
    expect(body.startChangesetIndex).toBe(4);
    expect(body.endChangesetIndex).toBe(8);
    expect(body.diffingPlan.strategy).toBe("VersionCompare");
    expect(result.comparisonJob.status).toBe("Queued");
    expect(result.comparisonJob.startChangesetId).toBe(startChangesetId);
    expect(result.comparisonJob.endChangesetId).toBe(endChangesetId);
  });

  it("reuses per-request strategy when resolving composite ids after posting", async () => {
    vi.mocked(iModelsClient.getChangeset)
      .mockResolvedValueOnce(createChangeset(startChangesetId, 4))
      .mockResolvedValueOnce(createChangeset(endChangesetId, 8));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "Full" },
      },
    }), { status: 202 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      jobs: [{
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "Full" },
      }],
    }), { status: 200 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "Full" },
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
      diffingStrategy: "VersionCompare",
    });

    await client.postComparisonJob({
      iTwinId,
      iModelId,
      startChangesetId,
      endChangesetId,
      diffingStrategy: "Full",
      headers: { "Content-Type": "application/json" },
    });

    await client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${startChangesetId}-${endChangesetId}`,
    });

    const [listUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(listUrl).toContain("diffingStrategy=Full");
  });

  it("resolves composite ids through list and hydrates completed href from detailed endpoint", async () => {
    vi.mocked(iModelsClient.getChangeset)
      .mockResolvedValueOnce(createChangeset(startChangesetId, 4))
      .mockResolvedValueOnce(createChangeset(endChangesetId, 8));

    const jobId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      jobs: [{
        jobId,
        status: "Completed",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "VersionCompare" },
      }],
    }), { status: 200 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId,
        status: "Completed",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "VersionCompare" },
        href: "https://example.test/results",
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    const result = await client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${startChangesetId}-${endChangesetId}`,
    });

    expect(result.comparisonJob.status).toBe("Completed");
    if (result.comparisonJob.status !== "Completed") {
      throw new Error("Expected completed comparison job.");
    }
    expect(result.comparisonJob.comparison.href).toBe("https://example.test/results");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("matches lowercase diffingStrategy values from list responses", async () => {
    vi.mocked(iModelsClient.getChangeset)
      .mockResolvedValueOnce(createChangeset(startChangesetId, 4))
      .mockResolvedValueOnce(createChangeset(endChangesetId, 8));

    const jobId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      jobs: [{
        jobId,
        status: "Completed",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingStrategy: "versioncompare",
      }],
    }), { status: 200 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId,
        status: "Completed",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingStrategy: "versioncompare",
        href: "https://example.test/results",
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    const result = await client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${startChangesetId}-${endChangesetId}`,
    });

    expect(result.comparisonJob.status).toBe("Completed");
    if (result.comparisonJob.status !== "Completed") {
      throw new Error("Expected completed comparison job.");
    }
    expect(result.comparisonJob.comparison.href).toBe("https://example.test/results");
    expect(result.comparisonJob.diffingPlan?.strategy).toBe("VersionCompare");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves UUID composite job IDs by trying the midpoint split first", async () => {
    // startChangesetId and endChangesetId are both UUIDs (36 chars each).
    // Their composite "uuid1-uuid2" has 9 dashes; the correct separator is at
    // index 36 — the midpoint. After sorting by distance from midpoint, this
    // candidate is tried first, so getChangeset is called exactly twice.
    vi.mocked(iModelsClient.getChangeset)
      .mockImplementation(async ({ changesetId }) => {
        if (changesetId === startChangesetId)
          return createChangeset(startChangesetId, 4);
        if (changesetId === endChangesetId)
          return createChangeset(endChangesetId, 8);
        return undefined;
      });

    const jobId = `${startChangesetId}-${endChangesetId}`;

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      jobs: [{
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "VersionCompare" },
      }],
    }), { status: 200 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "VersionCompare" },
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    const result = await client.getComparisonJob({ iTwinId, iModelId, jobId });

    expect(result.comparisonJob.status).toBe("Queued");
    // Midpoint-first sorting means the correct split is tried on the first attempt.
    expect(vi.mocked(iModelsClient.getChangeset)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(iModelsClient.getChangeset)).toHaveBeenCalledWith({ iModelId, changesetId: startChangesetId });
    expect(vi.mocked(iModelsClient.getChangeset)).toHaveBeenCalledWith({ iModelId, changesetId: endChangesetId });
  });

  it("maps DiffJobNotFound to ComparisonNotFound", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: "DiffJobNotFound",
        message: "Requested DiffJob is not available.",
      },
    }), { status: 404 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    await expect(client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    })).rejects.toMatchObject({ code: "ComparisonNotFound" });
  });

  it("rejects unsupported delete job identifiers instead of silently succeeding", async () => {
    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    await expect(client.deleteComparisonJob({
      iTwinId,
      iModelId,
      jobId: "not-a-composite-job-id",
    })).rejects.toMatchObject({ code: "ComparisonNotFound" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps DiffJobNotFound during delete to ComparisonNotFound", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: "DiffJobNotFound",
        message: "Requested DiffJob is not available.",
      },
    }), { status: 404 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    await expect(client.deleteComparisonJob({
      iTwinId,
      iModelId,
      jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    })).rejects.toMatchObject({ code: "ComparisonNotFound" });
  });

  it("maps DiffJobNotFound raised while resolving a composite id for delete to ComparisonNotFound", async () => {
    vi.mocked(iModelsClient.getChangeset)
      .mockResolvedValueOnce(createChangeset(startChangesetId, 4))
      .mockResolvedValueOnce(createChangeset(endChangesetId, 8));

    // The list query used to resolve the composite id into a UUID fails with DiffJobNotFound.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: "DiffJobNotFound",
        message: "Requested DiffJob is not available.",
      },
    }), { status: 404 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    await expect(client.deleteComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${startChangesetId}-${endChangesetId}`,
    })).rejects.toMatchObject({ code: "ComparisonNotFound" });
  });

  it("resolves hash-like composite ids and issues filtered /diff query", async () => {
    const hashStart = "16063aa71dfbcee75d32a7c5a31ca40e9bb2b094";
    const hashEnd = "8968f5c4449d26c0dababf37aed17dcc49d7059f";

    vi.mocked(iModelsClient.getChangeset)
      .mockImplementation(async ({ changesetId }) => {
        if (changesetId === hashStart)
          return createChangeset(hashStart, 3);
        if (changesetId === hashEnd)
          return createChangeset(hashEnd, 7);
        return undefined;
      });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      jobs: [{
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 3,
        endChangesetIndex: 7,
        diffingPlan: { strategy: "VersionCompare" },
      }],
    }), { status: 200 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 3,
        endChangesetIndex: 7,
        diffingPlan: { strategy: "VersionCompare" },
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    const result = await client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${hashStart}-${hashEnd}`,
    });

    expect(result.comparisonJob.status).toBe("Queued");
    expect(fetchMock).toHaveBeenCalled();
    const [firstUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toContain("/diff?");
    expect(firstUrl).toContain("startChangesetIndex=3");
    expect(firstUrl).toContain("endChangesetIndex=7");
    expect(firstUrl).toContain("diffingStrategy=VersionCompare");
  });

  it("forwards signal and headers when listing jobs for composite ids", async () => {
    vi.mocked(iModelsClient.getChangeset)
      .mockResolvedValueOnce(createChangeset(startChangesetId, 4))
      .mockResolvedValueOnce(createChangeset(endChangesetId, 8));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      jobs: [{
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "VersionCompare" },
      }],
    }), { status: 200 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "VersionCompare" },
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    const signal = new AbortController().signal;
    await client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${startChangesetId}-${endChangesetId}`,
      signal,
      headers: {
        "X-Test-Header": "test-value",
      },
    });

    const [, firstRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstRequest.signal).toBe(signal);
    expect(firstRequest.headers).toMatchObject({
      "X-Test-Header": "test-value",
    });
  });

  it("forwards signal when downloading comparison job results", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      changedElements: {
        elements: [],
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    const signal = new AbortController().signal;
    await client.getComparisonJobResult({
      signal,
      comparisonJob: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Completed",
        iTwinId,
        iModelId,
        comparison: {
          href: "https://example.test/results",
        },
      },
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.signal).toBe(signal);
  });

  it("does not delete a fallback strategy job when preferred strategy is not found", async () => {
    vi.mocked(iModelsClient.getChangeset)
      .mockResolvedValueOnce(createChangeset(startChangesetId, 4))
      .mockResolvedValueOnce(createChangeset(endChangesetId, 8));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      jobs: [{
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "Queued",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
        diffingPlan: { strategy: "Full" },
      }],
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
      diffingStrategy: "VersionCompare",
    });

    await expect(client.deleteComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${startChangesetId}-${endChangesetId}`,
    })).rejects.toMatchObject({ code: "ComparisonNotFound" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(firstUrl).toContain("diffingStrategy=VersionCompare");
    expect(secondUrl).toContain("/diff?");
  });

  it("does not mask iModelsClient failures while resolving composite ids", async () => {
    vi.mocked(iModelsClient.getChangeset).mockRejectedValue(new Error("iModels unavailable"));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    await expect(client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: `${startChangesetId}-${endChangesetId}`,
    })).rejects.toThrow("iModels unavailable");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on unsupported status values returned by API", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      job: {
        jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "UnknownFutureStatus",
        iTwinId,
        iModelId,
        startChangesetIndex: 4,
        endChangesetIndex: 8,
      },
    }), { status: 200 }));

    const client = new DiffJobClient({
      baseUrl: "https://api.bentley.com/changedelements",
      getAccessToken: async () => "Bearer token",
      iModelsClient,
    });

    await expect(client.getComparisonJob({
      iTwinId,
      iModelId,
      jobId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    })).rejects.toThrow("unsupported diff job status");
  });
});

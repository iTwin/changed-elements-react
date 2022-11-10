/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { rest } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, assert, beforeAll, describe, expect, it } from "vitest";
import { callITwinApi } from "./callITwinApi";

describe("callITwinApi", () => {
  const server = setupServer();
  const accessToken = "TestAccessToken";

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it("performs GET request to iTwin services by default", async () => {
    server.resetHandlers(rest.get(
      "https://api.bentley.com/changedelements/test",
      (req, res, ctx) => {
        expect(req.headers.get("Accept")).toBe("application/vnd.bentley.itwin-platform.v1+json");
        expect(req.headers.get("Authorization")).toBe("TestAccessToken");
        expect(req.bodyUsed).toBe(false);
        return res(ctx.status(200));
      },
    ));
    const response = await callITwinApi({ endpoint: "/test" }, { accessToken });
    expect(response.status).toBe(200);
  });

  it("uses provided base url", async () => {
    server.resetHandlers(rest.get(
      "https://example.com/TestEndpoint",
      (_, res, ctx) => res(ctx.status(200)),
    ));
    const response = await callITwinApi({ endpoint: "/TestEndpoint" }, { accessToken, baseUrl: "https://example.com" });
    expect(response.status).toBe(200);
  });

  it("uses supplied method and body", async () => {
    server.resetHandlers(rest.put(
      "https://api.bentley.com/changedelements",
      async (req, res, ctx) => {
        expect(await req.json()).toStrictEqual({ property: "TestValue" });
        return res(ctx.status(200));
      },
    ));
    const response = await callITwinApi(
      { endpoint: "", method: "PUT", body: { property: "TestValue" } },
      { accessToken },
    );
    expect(response.status).toBe(200);
  });

  it("allows signalling request cancellation", async () => {
    server.resetHandlers(rest.get(
      "https://api.bentley.com/changedelements",
      () => assert.fail("Request was not cancelled."),
    ));
    const abortConroller = new AbortController();
    const responsePromise = callITwinApi({ endpoint: "" }, { accessToken, abortSignal: abortConroller.signal });
    abortConroller.abort();
    await expect(responsePromise).rejects.toThrow("The user aborted a request.");
  });

  it("attempts to parse returned error", async () => {
    server.resetHandlers(rest.get(
      "https://api.bentley.com/changedelements",
      (_, res, ctx) => res(ctx.json({ error: "TestError" }), ctx.status(400)),
    ));
    const responsePromise = callITwinApi({ endpoint: "" }, { accessToken });
    await expect(responsePromise).rejects.toThrowError(expect.objectContaining({ body: { error: "TestError" } }));
  });

  it("returns error message when error cannot be parsed", async () => {
    server.resetHandlers(rest.get(
      "https://api.bentley.com/changedelements",
      (_, res, ctx) => res(ctx.status(400)),
    ));
    const responsePromise = callITwinApi({ endpoint: "" }, { accessToken });
    await expect(responsePromise).rejects.toThrow("Unexpected response status code: 400 Bad Request.");
  });
});

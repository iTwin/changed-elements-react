/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { HalLinks } from "./common.js";

export interface CallITwinApiParams {
  method?: "GET" | "POST" | "DELETE";
  url: string;
  getAccessToken: () => Promise<string>;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string> | undefined;
  body?: Record<string, unknown> | undefined;
}

/**
 * Calls the iTwin API and returns the raw, unvalidated JSON body.
 * @throws on a non 2XX response.
 */
export async function callITwinApi(args: CallITwinApiParams): Promise<Record<string, unknown> | undefined>;
/**
 * Calls the iTwin API and validates the JSON body against the provided type guard.
 * @throws on a non 2XX response, or if the response body does not satisfy `validate`.
 */
export async function callITwinApi<T>(
  args: CallITwinApiParams & { validate: (value: unknown) => value is T; },
): Promise<T>;
export async function callITwinApi<T>(
  args: CallITwinApiParams & { validate?: (value: unknown) => value is T; },
): Promise<T | Record<string, unknown> | undefined> {
  const response = await fetch(
    args.url,
    {
      method: args.method,
      headers: {
        ...args.headers,
        Authorization: await args.getAccessToken(),
      },
      body: args.body && JSON.stringify(args.body),
      signal: args.signal,
    },
  );

  if (!response.ok) {
    await throwBadResponseCodeError(response, "iTwin API request failed.");
  }

  const body = response.status !== 204 ? await response.json() : undefined;
  if (args.validate) {
    if (!args.validate(body)) {
      throw new Error(`iTwin API request to ${args.url} returned an unexpected response shape.`);
    }
    return body;
  }

  return body;
}

export async function* callPagedITwinApi(
  args: CallITwinApiParams,
  backwards?: boolean,
): AsyncIterableIterator<Record<string, unknown>> {
  let nextArgs: CallITwinApiParams | undefined = args;
  while (nextArgs) {
    const response = await callITwinApi(nextArgs);
    if (!response) {
      nextArgs = undefined;
      continue;
    }
    yield response;
    const links = response._links as HalLinks<["prev"?, "next"?]>;
    const nextPageUrl = backwards ? links.prev?.href : links.next?.href;
    nextArgs = nextPageUrl
      ? {
        url: nextPageUrl,
        getAccessToken: args.getAccessToken,
        signal: args.signal,
        headers: args.headers,
      }
      : undefined;
  }
}

export async function throwBadResponseCodeError(
  response: Response,
  errorMessage: string,
): Promise<never> {
  let error: unknown;
  try {
    error = (await response.json()).error;
  } catch {
    throw new Error(`${errorMessage} Unexpected response status code: ${response.status} ${response.statusText}.`);
  }

  throw error;
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

export interface CallITwinApiParams {
  method?: "GET" | "POST";
  url: string;
  getAccessToken?: () => Promise<string>;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string> | undefined;
  body?: Record<string, unknown> | undefined;
}

export async function callITwinApi(args: CallITwinApiParams): Promise<Record<string, unknown>> {
  const response = await fetch(
    args.url,
    args.getAccessToken ? {
      method: args.method,
      headers: {
        ...args.headers,
        Authorization: await args.getAccessToken(),
      },
      body: args.body && JSON.stringify(args.body),
      signal: args.signal,
    } :
      {
        method: args.method,
        headers: {
          ...args.headers,
        },
        body: args.body && JSON.stringify(args.body),
        signal: args.signal,
      },
  );

  if (!response.ok) {
    await throwBadResponseCodeError(response, "iTwin API request failed.");
  }

  return response.json();
}

export async function* callPagedITwinApi(
  args: CallITwinApiParams,
  backwards?: boolean,
): AsyncIterableIterator<Record<string, unknown>> {
  let nextArgs: CallITwinApiParams | undefined = args;
  while (nextArgs) {
    const response = await callITwinApi(nextArgs);
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

type HalLinks<T extends Array<string | undefined>> = {
  [K in keyof T as T[K] & string]: { href: string; };
};

async function throwBadResponseCodeError(
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

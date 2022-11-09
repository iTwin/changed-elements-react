/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
export interface CallITwinApiArgs {
  endpoint: string;
  body?: Record<string, unknown>;
  method?: "GET" | "PUT";
}

export interface CommonRequestArgs {
  /** OAuth access token with scope `changedelements:read`. */
  accessToken: string;

  /**
   * Base URL of Changed Elements service.
   * @default "https://api.bentley.com/changedelements"
   */
  baseUrl?: string;

  /** Signal that will cause the request to abort. */
  abortSignal?: AbortSignal | undefined;
}

/** @internal */
export async function callITwinApi(args: CallITwinApiArgs, commonArgs: CommonRequestArgs): Promise<Response> {
  const response = await fetch(
    (commonArgs.baseUrl ?? "https://api.bentley.com/changedelements") + args.endpoint,
    {
      method: args.method,
      headers: {
        Accept: "application/vnd.bentley.itwin-platform.v1+json",
        Authorization: commonArgs.accessToken,
      },
      body: args.body && JSON.stringify(args.body),
      signal: commonArgs.abortSignal,
    },
  );
  if (response.ok) {
    return response;
  }

  let errorBody;
  try {
    errorBody = await response.json();
  } catch {
    throw new Error(`Unexpected response status code: ${response.status} ${response.statusText}.`);
  }

  throw new RestError(errorBody);
}

class RestError extends Error {
  public body: object;

  constructor(body: object) {
    super();
    this.body = body;
  }
}

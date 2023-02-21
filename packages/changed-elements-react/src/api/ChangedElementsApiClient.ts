/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode, Logger } from "@itwin/core-bentley";
import type { ChangedElements } from "@itwin/core-common";

import type { ChangedElementsClientBase } from "./ChangedElementsClientBase";
import { VersionCompare } from "./VersionCompare";

const REQUEST_TIMEOUT = 5 * 60 * 1000;
const COMPARISON_CHUNK_SIZE = 200;

export class ChangedElementsApiClient implements ChangedElementsClientBase {
  private getAccessToken = () => VersionCompare.getAccessToken();

  private changesetCache: ChangesetCache | undefined = undefined;

  public constructor(private baseUrl: string) { }

  public async getChangedElements(
    iTwinId: string,
    iModelId: string,
    startChangesetId: string,
    endChangesetId: string,
  ): Promise<ChangedElements[]> {
    if (startChangesetId === endChangesetId) {
      return [
        await this.getComparison(
          iTwinId,
          iModelId,
          startChangesetId,
          endChangesetId,
        ),
      ];
    }

    let startChangesetIndex = -1;
    let endChangesetIndex = -1;
    const changesets = await this.getAllChangesets(iTwinId, iModelId);
    changesets.forEach((changeset: ChangesetStatus, index: number) => {
      if (changeset.id === startChangesetId) {
        startChangesetIndex = index;
      } else if (changeset.id === endChangesetId) {
        endChangesetIndex = index;
      }
    });

    if (startChangesetIndex === -1 || endChangesetIndex === -1) {
      Logger.logError(
        VersionCompare.logCategory,
        "Version compare failed: Received invalid changeset ids.",
      );
      return [];
    }

    if (endChangesetIndex < startChangesetIndex) {
      const temp = startChangesetIndex;
      startChangesetIndex = endChangesetIndex;
      endChangesetIndex = temp;
    }

    // Comparison base is the iModel state after applying the selected (start) changeset
    startChangesetIndex += 1;

    const result: ChangedElements[] = [];
    for (
      let i = startChangesetIndex;
      i <= endChangesetIndex;
      i += COMPARISON_CHUNK_SIZE
    ) {
      const comparison = await this.getComparison(
        iTwinId,
        iModelId,
        changesets[i].id,
        changesets[Math.min(i + COMPARISON_CHUNK_SIZE - 1, endChangesetIndex)]
          .id,
      );
      result.push(comparison);
    }

    return result;
  }

  public async getChangedElementsInChunks(
    iTwinId: string,
    iModelId: string,
    changesetChunks: ChangesetChunk[],
  ): Promise<ChangedElements[]> {
    const result: ChangedElements[] = [];
    for (const chunk of changesetChunks) {
      const comparison = await this.getComparison(
        iTwinId,
        iModelId,
        chunk.startChangesetId,
        chunk.endChangesetId,
      );
      result.push(comparison);
    }

    return result;
  }

  private async getComparison(
    iTwinId: string,
    iModelId: string,
    startChangesetId: string,
    endChangesetId: string,
  ): Promise<ChangedElements> {
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; ++i) {
      try {
        const { changedElements } = await getComparison(
          { iTwinId, iModelId, startChangesetId, endChangesetId },
          {
            baseUrl: this.baseUrl,
            getAccessToken: this.getAccessToken,
          },
        );
        return changedElements;
      } catch (error) {
        Logger.logWarning(
          VersionCompare.logCategory,
          `Failed to get comparison: "${JSON.stringify(error)}". Attempt ${i + 1
          }/${maxAttempts}.`,
        );
      }
    }

    const errorMessage = `Failed to get comparison after ${maxAttempts} attempts.`;
    Logger.logError(VersionCompare.logCategory, errorMessage);
    throw new Error(errorMessage);
  }

  public async getProcessedChangesets(
    iTwinId: string,
    iModelId: string,
  ): Promise<string[]> {
    const changesets = await this.getAllChangesets(iTwinId, iModelId);
    const result: string[] = [];
    for (const status of changesets) {
      if (status.ready) {
        result.push(status.id);
      }
    }

    return result;
  }

  private async getAllChangesets(
    iTwinId: string,
    iModelId: string,
  ): Promise<ChangesetStatus[]> {
    if (this.changesetCache?.iModelId === iModelId) {
      return this.changesetCache.response;
    }

    const responses: Array<ChangesetStatus[]> = [];
    for await (const response of this.getChangesetsPaged({
      iTwinId,
      iModelId,
      backwards: false,
    })) {
      responses.push(response);
    }

    this.changesetCache = { iModelId, response: responses.flat() };
    return this.changesetCache.response;
  }

  public async *getChangesetsPaged(
    args: GetChangesetsArgs & { backwards?: boolean; },
  ): AsyncIterableIterator<ChangesetStatus[]> {
    const changesetsIterator = getChangesetsPaged(args, {
      baseUrl: this.baseUrl,
      getAccessToken: this.getAccessToken,
    });
    for await (const response of changesetsIterator) {
      yield response.changesetStatus;
    }
  }

  public async isProcessed(
    iTwinId: string,
    iModelId: string,
    changesetId: string,
  ): Promise<boolean> {
    const changesetsIterator = getChangesetsPaged(
      { iTwinId, iModelId },
      { baseUrl: this.baseUrl, getAccessToken: this.getAccessToken },
    );
    for await (const response of changesetsIterator) {
      for (const status of response.changesetStatus) {
        if (status.id === changesetId) {
          return status.ready;
        }
      }
    }

    return false;
  }
}

interface ChangesetCache {
  iModelId: string;
  response: ChangesetStatus[];
}

export interface ChangesetChunk {
  startChangesetId: string;
  endChangesetId: string;
}

interface GetChangesetsArgs {
  iTwinId: string;
  iModelId: string;
  top?: number | undefined;
  skip?: number | undefined;
}

interface GetChangesetsResult {
  changesetStatus: ChangesetStatus[];
  _links: HalLinks<["self", "prev"?, "next"?]>;
}

export interface ChangesetStatus {
  id: string;
  index: number;
  ready: boolean;
}

type HalLinks<T extends Array<string | undefined>> = {
  [K in keyof T as T[K] & string]: { href: string; };
};

function getChangesetsPaged(
  args: GetChangesetsArgs & { backwards?: boolean; },
  commonArgs: CommonRequestArgs,
): AsyncIterableIterator<GetChangesetsResult> {
  const top = args.top !== undefined ? `&$top=${args.top}` : "";
  const skip = args.skip !== undefined ? `&$skip=${args.skip}` : "";
  const endpoint = `/changesets?iTwinId=${args.iTwinId}&iModelId=${args.iModelId}${top}${skip}`;
  return callPagedITwinApi<GetChangesetsResult>(
    endpoint,
    !!args.backwards,
    commonArgs,
  );
}

interface GetComparisonArgs {
  iTwinId: string;
  iModelId: string;
  startChangesetId: string;
  endChangesetId: string;
}

interface GetComparisonResult {
  changedElements: {
    elements: string[];
    classIds: string[];
    modelIds: string[];
    parendIds: string[];
    parentClassIds: string[];
    opcodes: DbOpcode[];
    type: number[];
    properties: string[][];
    oldChecksums: number[][];
    newChecksums: number[][];
  };
}

async function getComparison(
  args: GetComparisonArgs,
  commonArgs: CommonRequestArgs,
): Promise<GetComparisonResult> {
  const response = await callITwinApi(
    `/comparison?iTwinId=${args.iTwinId}&iModelId=${args.iModelId}&startChangesetId=${args.startChangesetId}&endChangesetId=${args.endChangesetId}`,
    commonArgs,
  );
  if (!response.ok) {
    await throwBadResponseCodeError(
      response,
      "Failed to get changed elements:",
    );
  }

  return response.json();
}

interface CommonRequestArgs {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
}

async function callITwinApi(
  endpoint: string,
  commonArgs: CommonRequestArgs,
): Promise<Response> {
  return fetchITwinApi(
    commonArgs.baseUrl + endpoint,
    commonArgs.getAccessToken,
  );
}

async function* callPagedITwinApi<T extends Record<keyof unknown, unknown>>(
  endpoint: string,
  backwards: boolean,
  commonArgs: CommonRequestArgs,
): AsyncIterableIterator<T> {
  let nextPageUrl = commonArgs.baseUrl + endpoint;
  while (nextPageUrl) {
    const response = await fetchITwinApi(
      nextPageUrl,
      commonArgs.getAccessToken,
    );
    if (!response.ok) {
      await throwBadResponseCodeError(response, "iTwin API request failed.");
    }

    const json = await response.json();
    yield json;
    nextPageUrl = backwards ? json._links.prev?.href : json._links.next?.href;
  }
}

async function fetchITwinApi(
  url: string,
  getAccessToken: () => Promise<string>,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT);
  return fetch(url, {
    headers: {
      Accept: "application/vnd.bentley.itwin-platform.v1+json",
      Authorization: await getAccessToken(),
    },
    signal: abortController.signal,
  }).finally(() => {
    // Do not allow used memory to build up
    clearTimeout(timeout);
  });
}

async function throwBadResponseCodeError(
  response: Response,
  errorMessage: string,
): Promise<never> {
  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`${errorMessage} Unexpected response status code: ${response.status} ${response.statusText}.`);
  }

  throw new Error(JSON.stringify(json));
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  Changeset, GetChangesetParams, GetChangesetsParams, GetNamedVersionsParams, IModelsClient, NamedVersion
} from "./iModelsClient.js";
import { callPagedITwinApi, callITwinApi } from "./iTwinApi.js";

export interface ITwinIModelsClientParams {
  baseUrl?: string | undefined;
  getAccessToken: () => Promise<string>;
  showHiddenNamedVersions?: boolean | undefined;
}

export class ITwinIModelsClient implements IModelsClient {
  private baseUrl: string;
  private getAccessToken: () => Promise<string>;
  private showHiddenNamedVersions: boolean;

  constructor(args: ITwinIModelsClientParams) {
    this.baseUrl = args.baseUrl ?? "https://api.bentley.com/imodels";
    this.getAccessToken = args.getAccessToken;
    this.showHiddenNamedVersions = !!args.showHiddenNamedVersions;
  }

  public async getChangeset(args: GetChangesetParams): Promise<Changeset | undefined> {
    const changeset = await callITwinApi({
      url: `${this.baseUrl}/${args.iModelId}/changesets/${args.changesetId}`,
      getAccessToken: this.getAccessToken,
      headers: { Accept: acceptMimeType },
    });
    return changeset?.changeset as Changeset | undefined;
  }

  public async getChangesets(args: GetChangesetsParams): Promise<Changeset[]> {
    const iterator = callPagedITwinApi({
      url: `${this.baseUrl}/${args.iModelId}/changesets`,
      getAccessToken: this.getAccessToken,
      signal: args.signal,
      headers: { Accept: acceptMimeType },
    });

    const pages: Array<unknown[]> = [];
    for await (const page of iterator) {
      pages.push((page as { changesets: unknown[]; }).changesets);
    }

    return pages.flat() as Changeset[];
  }

  public async getNamedVersions(args: GetNamedVersionsParams): Promise<NamedVersion[]> {
    const iterator = callPagedITwinApi({
      url: `${this.baseUrl}/${args.iModelId}/namedversions`,
      getAccessToken: this.getAccessToken,
      signal: args.signal,
      headers: { Accept: acceptMimeType, Prefer: "return=representation" },
    });

    const pages: Array<unknown[]> = [];
    for await (const page of iterator) {
      pages.push((page as { namedVersions: unknown[]; }).namedVersions);
    }

    let result = pages.flat();
    if (!this.showHiddenNamedVersions) {
      result = (result as Array<{ state: "visible" | "hidden"; }>).filter(({ state }) => state === "visible");
    }

    return result as NamedVersion[];
  }
}

const acceptMimeType = "application/vnd.bentley.itwin-platform.v2+json";

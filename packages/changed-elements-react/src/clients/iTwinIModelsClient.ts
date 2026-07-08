/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  Changeset, GetChangesetParams, GetChangesetsParams, GetNamedVersionsParams, IModelsClient, NamedVersion
} from "./iModelsClient.js";
import { callPagedITwinApi, callITwinApi } from "./iTwinApi.js";
import { isChangeset, isChangesetsPage, isNamedVersionsPage } from "./typeGuards.js";
import type { NamedVersionResponseItem } from "./typeGuards.js";

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
    const response = await callITwinApi({
      url: `${this.baseUrl}/${args.iModelId}/changesets/${args.changesetId}`,
      getAccessToken: this.getAccessToken,
      signal: args.signal,
      headers: { Accept: acceptMimeType },
    });
    if (response === undefined) {
      return undefined;
    }
    if (!isChangeset(response.changeset)) {
      throw new Error(`Changeset request for ${args.changesetId} returned an unexpected response shape.`);
    }
    return response.changeset;
  }

  public async getChangesets(args: GetChangesetsParams): Promise<Changeset[]> {
    const iterator = callPagedITwinApi({
      url: `${this.baseUrl}/${args.iModelId}/changesets`,
      getAccessToken: this.getAccessToken,
      signal: args.signal,
      headers: { Accept: acceptMimeType },
    });

    const pages: Changeset[][] = [];
    for await (const page of iterator) {
      if (!isChangesetsPage(page)) {
        throw new Error(`Changesets request for iModel ${args.iModelId} returned an unexpected response shape.`);
      }
      pages.push(page.changesets);
    }

    return pages.flat();
  }

  public async getNamedVersions(args: GetNamedVersionsParams): Promise<NamedVersion[]> {

    let urlParams = "";
    if (args.top || args.skip) {
      if (args.top) urlParams = `${urlParams}$top=${args.top}&`;
      if (args.skip) urlParams = `${urlParams}$skip=${args.skip}&`;
      if (args.orderby) urlParams = `${urlParams}$orderBy=${args.orderby} `;
      if (args.ascendingOrDescending && args.orderby) urlParams = `${urlParams}${args.ascendingOrDescending}`;
      const response = await callITwinApi({
        url: `${this.baseUrl}/${args.iModelId}/namedversions?${urlParams}`,
        getAccessToken: this.getAccessToken,
        signal: args.signal,
        headers: { Accept: acceptMimeType, Prefer: "return=representation" },
      });
      if (!response || !isNamedVersionsPage(response)) return [];
      return response.namedVersions;
    }

    if (args.orderby) urlParams = `${urlParams}$orderBy=${args.orderby} `;
    if (args.ascendingOrDescending && args.orderby) urlParams = `${urlParams}${args.ascendingOrDescending}`;

    const iterator = callPagedITwinApi({
      url: `${this.baseUrl}/${args.iModelId}/namedversions?${urlParams}`,
      getAccessToken: this.getAccessToken,
      signal: args.signal,
      headers: { Accept: acceptMimeType, Prefer: "return=representation" },
    });

    const pages: NamedVersionResponseItem[][] = [];
    for await (const page of iterator) {
      if (!isNamedVersionsPage(page)) {
        throw new Error(`Named versions request for iModel ${args.iModelId} returned an unexpected response shape.`);
      }
      pages.push(page.namedVersions);
    }

    let result: NamedVersionResponseItem[] = pages.flat();
    if (!this.showHiddenNamedVersions) {
      result = result.filter(({ state }) => state === "visible");
    }

    return result;
  }

}

const acceptMimeType = "application/vnd.bentley.itwin-platform.v2+json";

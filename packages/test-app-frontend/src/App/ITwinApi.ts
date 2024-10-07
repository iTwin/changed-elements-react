/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { AuthorizationClient } from "@itwin/core-common";

import { applyUrlPrefix } from "../environment.js";

export interface GetUserProfileResult {
  user: {
    displayName: string;
    givenName: string;
    surname: string;
    email: string;
    alternateEmail: string;
    phone: string;
    organizationName: string;
    city: string;
    country: string;
    language: string;
    createdDateTime: string;
  };
}

export function getUserProfile(requestArgs: RequestArgs): Promise<GetUserProfileResult | undefined> {
  return callITwinApi(
    {
      url: applyUrlPrefix("https://api.bentley.com/users/me"),
      postProcess: async (response) => response.json(),
    },
    requestArgs,
  );
}

export interface ITwin {
  id: string;
  class: string;
  subClass: string;
  type: string | null;
  number: string;
  displayName: string;
  geographicLocation: string | null;
  dataCenterLocation: string;
  status: "Active" | "Inactive" | "Trial";
  parentId: string | null;
  iTwinAccountId: string | null;
  imageName: string | null;
  image: string | null;
  createdDateTime: string;
  createdBy: string | null;
}

export interface GetRecentITwinsResult {
  iTwins: ITwin[];
  _links: HalLinks<["self", "next"?, "prev"?]>;
}

export async function getRecentITwins(requestArgs: RequestArgs): Promise<GetRecentITwinsResult | undefined> {
  return callITwinApi(
    {
      url: applyUrlPrefix("https://api.bentley.com/itwins/recents?subclass=Project"),
      additionalHeaders: { Prefer: "return=representation" },
      postProcess: async (response) => response.json(),
    },
    requestArgs,
  );
}

export interface GetAllITwinsResult {
  iTwins: ITwin[];
  _links: HalLinks<["self", "next"?, "prev"?]>;
}

export async function getAllITwins(requestArgs: RequestArgs): Promise<GetAllITwinsResult | undefined> {
  return callITwinApi(
    {
      url: applyUrlPrefix("https://api.bentley.com/itwins?subclass=Project"),
      additionalHeaders: { Prefer: "return=representation" },
      postProcess: async (response) => response.json(),
    },
    requestArgs,
  );
}

export interface GetITwinIModelsArgs {
  iTwinId: string;
}

export interface GetITwinIModelsResult {
  iModels: Array<{

    id: string;
    displayName: string;
    name: string;
    description: string | null;
    state: string;
    createdDateTime: string;
    iTwinId: string;
    extent: {
      southWest: GeoCoordinates;
      northEast: GeoCoordinates;
    } | null;
    _links: HalLinks<["creator", "changesets", "namedVersions"]>;
  }>;
  _links: HalLinks<["self", "prev"?, "next"?]>;
}

interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export async function getITwinIModels(
  args: GetITwinIModelsArgs,
  requestArgs: RequestArgs,
): Promise<GetITwinIModelsResult | undefined> {
  return callITwinApi(
    {
      url: applyUrlPrefix(`https://api.bentley.com/imodels?iTwinId=${args.iTwinId}`),
      additionalHeaders: { Prefer: "return=representation" },
      apiVersion: 2,
      postProcess: async (response) => response.json(),
    },
    requestArgs,
  );
}

export interface GetIModelChangesetsArgs {
  iModelId: string;
}

export interface GetIModelChangesetsResult {
  changesets: Array<{
    id: string;
    displayName: string;
    description: string | null;
    index: number;
    parentId: string | null;
    creatorId: string;
    pushDateTime: string;
    state: string;
    containingChanges: number;
    fileSize: number;
    briefcaseId: number;
    _links: HalLinks<["creator", "self"]>;
  }>;
  _links: HalLinks<["self", "prev"?, "next"?]>;
}

export async function getIModelChangesets(args: GetIModelChangesetsArgs, requestArgs: RequestArgs): Promise<GetIModelChangesetsResult | undefined> {
  return callITwinApi(
    {
      url: applyUrlPrefix(`https://api.bentley.com/imodels/${args.iModelId}/changesets`),
      additionalHeaders: { Prefer: "return=minimal" },
      apiVersion: 2,
      postProcess: (response) => response.json(),
    },
    requestArgs,
  );
}

export interface GetIModelNamedVersionsArgs {
  iModelId: string;
}

export interface GetIModelNamedVersionResult {
  namedVersions: Array<{
    id: string;
    displayName: string;
    changesetId: string | null;
    changesetIndex: number;
    name: string;
    description: string;
    createdDateTime: string;
    state: string;
    application: { id: string; name: string; };
    _links: HalLinks<["creator", "changeset"]>;
  }>;
}

export async function getIModelNamedVersions(args: GetIModelNamedVersionsArgs, requestArgs: RequestArgs): Promise<GetIModelNamedVersionResult | undefined> {
  return callITwinApi(
    {
      url: applyUrlPrefix(`https://api.bentley.com/imodels/${args.iModelId}/namedversions`),
      additionalHeaders: { Prefer: "return=representation" },
      apiVersion: 2,
      postProcess: (response) => response.json(),
    },
    requestArgs,
  );
}

export async function getIModelThumbnail(iModelId: string, requestArgs: RequestArgs): Promise<Blob | undefined> {
  return callITwinApi(
    {
      url: applyUrlPrefix(`https://api.bentley.com/imodels/${iModelId}/thumbnail?size=small`),
      apiVersion: 2,
      immutable: true,
      postProcess: async (response) => response.blob(),
    },
    requestArgs,
  );
}

export type HalLinks<T extends Array<string | undefined>> = {
  [K in keyof T as T[K] & string]: { href: string; };
};

interface CallITwinApiArgs<T> {
  url: string;
  additionalHeaders?: Record<string, string>;
  apiVersion?: number;
  immutable?: boolean;
  postProcess: (response: Response) => Promise<T>;
}

export interface RequestArgs {
  authorizationClient: AuthorizationClient;
}

export async function callITwinApi<T>(args: CallITwinApiArgs<T>, requestArgs: RequestArgs): Promise<T | undefined> {
  const headers = {
    ...args.additionalHeaders,
    Authorization: await requestArgs.authorizationClient.getAccessToken(),
    Accept: `application/vnd.bentley.itwin-platform.v${args.apiVersion ?? 1}+json`,
  };
  const key = JSON.stringify({ url: args.url, headers });
  const fetcher = async () => {
    const response = await fetch(args.url, { headers });
    return response.ok ? args.postProcess(response) : undefined;
  };
  return args.immutable ? requestStore.fetchImmutable(key, fetcher) : requestStore.fetch(key, fetcher);
}

class RequestStore {
  private requestCache = new Map<string, Promise<unknown>>();
  private responseCache = new Map<string, unknown>();

  /** Executes fetch while being aware of duplicate requests. */
  public async fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    let request = this.requestCache.get(key) as Promise<T> | undefined;
    if (request) {
      return request;
    }

    request = fetcher()
      .then((result) => {
        setTimeout(() => this.requestCache.delete(key), 2000);
        return result;
      })
      .catch((error) => {
        this.requestCache.delete(key);
        throw error;
      });
    this.requestCache.set(key, request);
    return request;
  }

  /** Execute fetch the first time unique URL and header combination is encountered. */
  public async fetchImmutable<T>(requestKey: string, fetcher: () => Promise<T>): Promise<T> {
    const cacheEntry = this.responseCache.get(requestKey) as Promise<T> | undefined;
    if (cacheEntry) {
      return cacheEntry;
    }

    const response = await this.fetch(requestKey, fetcher);
    if (!this.responseCache.has(requestKey)) {
      this.responseCache.set(requestKey, response);

      const cleanupThreshold = 1500;
      const amountToForget = 500;
      if (this.responseCache.size > cleanupThreshold) {
        [...this.responseCache.keys()].slice(0, amountToForget).forEach((key) => this.responseCache.delete(key));
      }
    }

    return response;
  }
}

const requestStore = new RequestStore();

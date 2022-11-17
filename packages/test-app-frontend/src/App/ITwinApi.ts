/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AuthorizationClient } from "@itwin/core-common";
import { applyUrlPrefix } from "../environment";

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
      endpoint: "users/me",
      postProcess: async (response) => response.json(),
    },
    requestArgs,
  );
}

export interface GetRecentITwinsResult {
  iTwins: Array<{

    id: string;
    class: string;
    subClass: string;
    type: string | null;
    displayName: string;
    number: string;
    dataCenterLocation: string;
    status: "Active" | "Inactive" | "Trial";
    parentId: string | null;
    createdDateTime: string;
    createdBy: string | null;
  }>;
  _links: HalLinks<["self", "next"?, "prev"?]>;
}

export async function getRecentITwins(requestArgs: RequestArgs): Promise<GetRecentITwinsResult | undefined> {
  return callITwinApi(
    {
      endpoint: "itwins/recents?subclass=Project",
      additionalHeaders: { Prefer: "return=representation" },
      postProcess: async (response) => response.json(),
    },
    requestArgs,
  );
}

export interface GetProjectIModelsArgs {
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
  args: GetProjectIModelsArgs,
  requestArgs: RequestArgs,
): Promise<GetITwinIModelsResult | undefined> {
  return callITwinApi(
    {
      endpoint: `imodels/?iTwinId=${args.iTwinId}`,
      additionalHeaders: { Prefer: "return=representation" },
      apiVersion: 2,
      postProcess: async (response) => response.json(),
    },
    requestArgs,
  );
}

export async function getIModelThumbnail(iModelId: string, requestArgs: RequestArgs): Promise<Blob | undefined> {
  return callITwinApi(
    {
      endpoint: `imodels/${iModelId}/thumbnail?size=small`,
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
  endpoint: string;
  additionalHeaders?: Record<string, string>;
  apiVersion?: number;
  immutable?: boolean;
  postProcess: (response: Response) => Promise<T>;
}

export interface RequestArgs {
  authorizationClient: AuthorizationClient;
}

async function callITwinApi<T>(args: CallITwinApiArgs<T>, requestArgs: RequestArgs): Promise<T | undefined> {
  const iTwinApiUrl = "https://api.bentley.com";
  const url = applyUrlPrefix(iTwinApiUrl) + args.endpoint;
  const headers = {
    ...args.additionalHeaders,
    Authorization: await requestArgs.authorizationClient.getAccessToken(),
    Accept: `application/vnd.bentley.itwin-platform.v${args.apiVersion ?? 1}+json`,
  };
  const key = JSON.stringify({ url, headers });
  const fetcher = async () => {
    const response = await fetch(url, { headers });
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

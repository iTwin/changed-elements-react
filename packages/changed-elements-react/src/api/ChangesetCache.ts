/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Authorization, IModelsClient, MinimalChangeset, NamedVersion } from "@itwin/imodels-client-management";

import { VersionCompare } from "./VersionCompare.js";

/** Caching utilities for changesets and named versions. */
export class ChangesetCache {
  private changesets: MinimalChangeset[] = [];
  private versions: NamedVersion[] = [];
  private iModelId = "";

  constructor(private iModelsClient: IModelsClient) { }

  /** Build the caches of changesets and versions. */
  private async buildCache() {
    const accessToken = await VersionCompare.getAccessToken();
    if (!accessToken) {
      return;
    }

    const changesetIterator = this.iModelsClient.changesets.getMinimalList({
      iModelId: this.iModelId,
      authorization: getAccessToken,
    });
    const changesets: MinimalChangeset[] = [];
    for await (const changeset of changesetIterator) {
      changesets.push(changeset);
    }

    const namedVersionIterator = this.iModelsClient.namedVersions.getRepresentationList({
      iModelId: this.iModelId,
      authorization: getAccessToken,
    });
    const namedVersions: NamedVersion[] = [];
    for await (const namedVersion of namedVersionIterator) {
      namedVersions.push(namedVersion);
    }

    this.changesets = changesets;
    this.versions = namedVersions;
  }

  /** Set the iModel Id, if it's different, clean caches. */
  private setIModelId(iModelId: string) {
    if (this.iModelId !== iModelId) {
      this.changesets = [];
      this.versions = [];
      this.iModelId = iModelId;
    }
  }

  /** Get changesets for the iModel. */
  public async getChangesets(iModelId: string): Promise<MinimalChangeset[]> {
    this.setIModelId(iModelId);

    if (this.changesets.length === 0) {
      await this.buildCache();
    }

    return this.changesets;
  }

  /** Returns an ordered list of changesets in start to end order. */
  public async getOrderedChangesets(iModelId: string): Promise<MinimalChangeset[]> {
    const changesets = await this.getChangesets(iModelId);
    return [...changesets].sort((a, b) => b.index - a.index);
  }

  /** Get versions for the iModel. */
  public async getVersions(iModelId: string): Promise<NamedVersion[]> {
    this.setIModelId(iModelId);

    if (this.versions.length === 0) {
      await this.buildCache();
    }

    return this.versions;
  }
}

async function getAccessToken(): Promise<Authorization> {
  const accessToken = await VersionCompare.getAccessToken();
  const [scheme, token] = accessToken.split(" ");
  return { scheme, token };
}

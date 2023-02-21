/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Authorization, IModelsClient, MinimalChangeset, NamedVersion } from "@itwin/imodels-client-management";

import { VersionCompare } from "./VersionCompare";

/** Caching utilities for changesets and named versions. */
export class ChangesetCache {
  private _changesets: MinimalChangeset[] = [];
  private _versions: NamedVersion[] = [];
  private _client = new IModelsClient();

  constructor(private _iModelId: string = "") { }

  /** Build the caches of changesets and versions. */
  private async _buildCache() {
    const accessToken = await VersionCompare.getAccessToken();
    if (!accessToken) {
      return;
    }

    const changesetIterator = this._client.changesets.getMinimalList({
      iModelId: this._iModelId,
      authorization: getAccessToken,
    });
    for await (const changeset of changesetIterator) {
      this._changesets.push(changeset);
    }

    const namedVersionIterator = this._client.namedVersions.getRepresentationList({
      iModelId: this._iModelId,
      authorization: getAccessToken,
    });
    for await (const namedVersion of namedVersionIterator) {
      this._versions.push(namedVersion);
    }
  }

  /** Set the iModel Id, if it's different, clean caches. */
  private _setIModelId(iModelId: string) {
    if (this._iModelId !== iModelId) {
      this._changesets = [];
      this._versions = [];
      this._iModelId = iModelId;
    }
  }

  /** Get changesets for the iModel. */
  public async getChangesets(iModelId: string): Promise<MinimalChangeset[]> {
    this._setIModelId(iModelId);

    if (this._changesets.length === 0) {
      await this._buildCache();
    }

    return this._changesets;
  }

  /** Returns an ordered list of changesets in start to end order. */
  public async getOrderedChangesets(iModelId: string): Promise<MinimalChangeset[]> {
    const changesets = await this.getChangesets(iModelId);
    return [...changesets].sort((a, b) => b.index - a.index);
  }

  /** Get versions for the iModel. */
  public async getVersions(iModelId: string): Promise<NamedVersion[]> {
    this._setIModelId(iModelId);

    if (this._versions.length === 0) {
      await this._buildCache();
    }

    return this._versions;
  }
}

async function getAccessToken(): Promise<Authorization> {
  const accessToken = await VersionCompare.getAccessToken();
  const [scheme, token] = accessToken.split(" ");
  return { scheme, token };
}

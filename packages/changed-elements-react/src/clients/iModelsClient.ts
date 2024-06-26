/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { CommonRequestParams } from "./common.js";

export interface IModelsClient {
  /** Retrieves a list of Changesets, ordered by ascending `index` property.*/
  getChangesets(args: GetChangesetsParams): Promise<Changeset[]>;

  /** Retrieves a changeset*/
  getChangeset(args: GetChangesetParams): Promise<Changeset | undefined>;

  /** Retrieves a list of all Named Versions, ordered by ascending `changesetIndex` property. */
  getNamedVersions(args: GetNamedVersionsParams): Promise<NamedVersion[]>;

  /** Retrieves a paged list of Named Versions */
  getNamedVersionsPaged(args: GetNamedVersionsPagedParams): Promise<NamedVersion[]>;
}

export interface GetChangesetParams extends GetChangesetsParams {
  changesetId: string;
}

export interface GetChangesetsParams extends CommonRequestParams {
  iModelId: string;
}

export interface Changeset {
  /** Changeset id. */
  id: string;

  /** Changeset display name. */
  displayName: string;

  /** Changeset description. */
  description: string;

  /** Changeset index. */
  index: number;

  /** Id of the parent Changeset. Empty string indicates that the Changeset does not have a parent. */
  parentId: string;

  /** Id of the user who created the Changeset. */
  creatorId: string;

  /** Datetime string of when the Changeset was created. */
  pushDateTime: string;
}

export interface GetNamedVersionsParams extends CommonRequestParams {
  iModelId: string;
}

export interface GetNamedVersionsPagedParams extends GetNamedVersionsParams {
  /** top of paging range max top = 1000. */
  top: number;

  /** skip for paging **/
  skip: number;

  /** order named versions by changesetIndex or createdDateTime */
  orderby?: "changesetIndex" | "createdDateTime";

  /** results should be ordered by ascending or descending */
  ascendingOrDescending?: "asc" | "desc";
}


export interface NamedVersion {
  /** Named Version id. */
  id: string;

  /** Named Version display name. */
  displayName: string;

  /**
   * Id of the backing Changeset. This value is `null` when the Named Version is created on iModel baseline (before any
   * Changesets).
   */
  changesetId: string | null;

  /**
   * Index of the backing Changeset. This value is `0` when the Named Version is created on iModel baseline (before any
   * Changesets).
   */
  changesetIndex: number;

  /** Named Version description. */
  description: string | null;

  /** Datetime string of when the Named Version was created. */
  createdDateTime: string;
}

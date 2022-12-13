/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { callITwinApi, CommonRequestArgs } from "./callITwinApi";

export interface GetTrackingArgs {
  /** Id of the iTwin where the iModel resides. */
  iTwinId: string;

  /** Id of the iModel to query tracking information. */
  iModelId: string;
}

export interface GetTrackingResult {
  /** Whether change tracking is enabled. */
  enabled: boolean;
}

/** Get tracking information about an iModel. */
export async function getTracking(args: GetTrackingArgs, commonArgs: CommonRequestArgs): Promise<GetTrackingResult> {
  const endpoint = `/tracking?iTwinId=${args.iTwinId}&iModelId=${args.iModelId}`;
  const response = await callITwinApi({ endpoint }, commonArgs);
  return response.json();
}

export interface PutTrackingArgs {
  /** Id of the iTwin where the iModel resides. */
  iTwinId: string;

  /** Id of the iModel to query tracking information. */
  iModelId: string;

  /** Whether to enable change tracking. */
  enable: boolean;
}

/** Enables or disables change tracking for an iModel. */
export async function putTracking(args: PutTrackingArgs, commonArgs: CommonRequestArgs): Promise<void> {
  const endpoint = "/tracking";
  await callITwinApi(
    {
      endpoint,
      method: "PUT",
      body: { iTwinId: args.iTwinId, iModelId: args.iModelId, enable: args.enable },
    },
    commonArgs,
  );
}

export interface GetChangesetsArgs {
  /** Id of the iTwin where the iModel resides. */
  iTwinId: string;

  /** Id of the iModel to query for status of changesets. */
  iModelId: string;

  /** Amount of changesets to return in a single result. Optional. */
  top?: number | undefined;

  /** Amount of changesets to skip when returning results. Optional. */
  skip?: number | undefined;
}

export interface GetChangesetsResult {
  changesetStatus: ChangesetStatus[];
  _links: HalLinks<["self", "prev"?, "next"?]>;
}

export interface ChangesetStatus {
  /** Global changeset identifier. */
  id: string;

  /** Sequential changeset identifier. */
  index: number;

  /** Whether Changed Elements service has completed processing the changeset. */
  ready: boolean;
}

export type HalLinks<T extends Array<string | undefined>> = {
  [K in keyof T as T[K] & string]: { href: string; };
};

/**
 * Get a list of processing statuses for changesets in an iModel. This list allows you to inspect which changesets are
 * ready to be used to generate a comparison summary.
 */
export async function getChangesets(
  args: GetChangesetsArgs,
  commonArgs: CommonRequestArgs,
): Promise<GetChangesetsResult> {
  const top = args.top !== undefined ? `&top=${args.top}` : "";
  const skip = args.skip !== undefined ? `&skip=${args.skip}` : "";
  const endpoint = `/changesets?iTwinId=${args.iTwinId}&iModelId=${args.iModelId}${top}${skip}`;
  const response = await callITwinApi({ endpoint }, commonArgs);
  return response.json();
}

export interface GetComparisonArgs {
  /** Id of the iTwin where the iModel resides. */
  iTwinId: string;

  /** Id of iModel to get a comparison for. */
  iModelId: string;

  /** Changeset Id for the beginning of the comparison range. */
  startChangesetId: string;

  /** Changeset Id for the ending of the comparison range. */
  endChangesetId: string;
}

export interface GetComparisonResult {
  changedElements: ChangedElements;
}

export interface ChangedElements {
  /** Array of changed element Ids. */
  elements: string[];

  /** Array of changed element class Ids. */
  classIds: string[];

  /** Array of changed element model Ids. */
  modelIds: string[];

  /** Array of changed element parent Ids. */
  parentIds: string[];

  /** Array of changed element parent class Ids. */
  parentClassIds: string[];

  /** Array of changed element operation codes. */
  opcodes: Opcode[];

  /** Array of changed element types of change. */
  type: TypeOfChange[];

  /** Array of changed elements' array of changed properties. */
  properties: string[][];

  /** Array of changed elements' array of old checksums for each property. */
  oldChecksums: number[][];

  /** Array of changed elements' array of new checksums for each property. */
  newChecksums: number[][];
}

export enum Opcode {
  /** An Element was deleted. */
  Delete = 9,

  /** A new Element was inserted. */
  Insert = 18,

  /** An element was modified. */
  Update = 23,
}

export enum TypeOfChange {
  /** A property in the element has changed. */
  Property = 1,

  /** The geometry of the element has changed. */
  Geometry = 2,

  /** The geometry of the element has changed. */
  Placement = 4,

  /** Related instance that provides properties for this element has changed. */
  Indirect = 8,

  /** Hidden properties of the element has changed. */
  Hidden = 16,
}

/** Obtains elements which have changed in the iModel between the given start and end changesets (inclusive). */
export async function getComparison(
  args: GetComparisonArgs,
  commonArgs: CommonRequestArgs,
): Promise<GetComparisonResult> {
  const endpoint = `/comparison?iTwinId=${args.iTwinId}&iModelId=${args.iModelId}&startChangesetId=${args.startChangesetId}&endChangesetId=${args.endChangesetId}`;
  const response = await callITwinApi({ endpoint }, commonArgs);
  return response.json();
}

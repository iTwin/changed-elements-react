/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { ChangedElementsPayload, ComparisonJob } from "./IComparisonJobClient.js";
import type { Changeset, NamedVersion } from "./iModelsClient.js";

/** Narrows `value` to a plain object record, allowing safe property access without casting. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validates the shape of a `comparisonJob` API response (Changed Elements v2). */
export function isComparisonJob(value: unknown): value is ComparisonJob {
  if (!isRecord(value) || !isRecord(value.comparisonJob)) {
    return false;
  }

  const job = value.comparisonJob;
  if (
    typeof job.jobId !== "string" ||
    typeof job.iTwinId !== "string" ||
    typeof job.iModelId !== "string"
  ) {
    return false;
  }

  switch (job.status) {
    case "Completed":
      return isRecord(job.comparison) && typeof job.comparison.href === "string";
    case "Started":
      return typeof job.currentProgress === "number" && typeof job.maxProgress === "number";
    case "Queued":
      return true;
    case "Failed":
      return typeof job.errorDetails === "string";
    default:
      return false;
  }
}

/**
 * Validates the shape of a Changed Elements payload. Only the top-level `changedElements`
 * property is checked -- the nested `ChangedElements` structure (from `@itwin/core-common`)
 * is not exhaustively validated.
 */
export function isChangedElementsPayload(value: unknown): value is ChangedElementsPayload {
  return isRecord(value) && isRecord(value.changedElements);
}

/** Validates the shape of a single Changeset returned by the iTwin iModels API. */
export function isChangeset(value: unknown): value is Changeset {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.description === "string" &&
    typeof value.index === "number" &&
    typeof value.parentId === "string" &&
    typeof value.creatorId === "string" &&
    typeof value.pushDateTime === "string"
  );
}

/** Validates a paged `{ changesets: Changeset[] }` response. */
export function isChangesetsPage(value: unknown): value is { changesets: Changeset[]; } {
  return isRecord(value) && Array.isArray(value.changesets) && value.changesets.every(isChangeset);
}

/**
 * Raw named version item as returned by the API, including the `state` field used to filter
 * hidden Named Versions. `state` is not part of the public `NamedVersion` type, but the extra
 * property is structurally compatible with `NamedVersion[]` when returned.
 */
export type NamedVersionResponseItem = NamedVersion & { state: "visible" | "hidden"; };

/** Validates the shape of a single Named Version returned by the iTwin iModels API. */
export function isNamedVersionResponseItem(value: unknown): value is NamedVersionResponseItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    (typeof value.changesetId === "string" || value.changesetId === null) &&
    typeof value.changesetIndex === "number" &&
    (typeof value.description === "string" || value.description === null) &&
    typeof value.createdDateTime === "string" &&
    (value.state === "visible" || value.state === "hidden")
  );
}

/** Validates a paged `{ namedVersions: NamedVersionResponseItem[] }` response. */
export function isNamedVersionsPage(value: unknown): value is { namedVersions: NamedVersionResponseItem[]; } {
  return isRecord(value) && Array.isArray(value.namedVersions) && value.namedVersions.every(isNamedVersionResponseItem);
}

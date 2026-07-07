/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ChangedElements } from "@itwin/core-common";

export type ChangedElementsApiVersion = "v2" | "v3";
export type DiffingStrategy = "Basic" | "VersionCompare" | "Full";

export interface IComparisonJobClient {
  /** Indicates which Changed Elements API version this client targets. */
  readonly apiVersion: ChangedElementsApiVersion;

  /** Gets comparison job status. Throws on encountering an error or receiving non-success response code. */
  getComparisonJob(args: GetComparisonJobParams): Promise<ComparisonJob>;

  /** Deletes comparison job status. Throws on encountering an error or receiving non-success response code. */
  deleteComparisonJob(args: GetComparisonJobParams): Promise<void>;

  /** Gets changed elements based on a provided complete comparison job. Throws on encountering an error or receiving non-success response code. */
  getComparisonJobResult(args: GetComparisonJobResultParams): Promise<ChangedElementsPayload>;

  /** Starts comparison job. Throws on encountering an error or receiving non-success response code. */
  postComparisonJob(args: PostComparisonJobParams): Promise<ComparisonJob>;

}

type BodilessRequest = Omit<CommonRequestParams, "body">;

export interface GetComparisonJobParams extends BodilessRequest {
  iTwinId: string;
  iModelId: string;
  jobId: string;
}

export interface DeleteComparisonJobParams extends GetComparisonJobParams { }

export type ComparisonJob = ComparisonJobCompleted | ComparisonJobStarted | ComparisonJobQueued | ComparisonJobFailed;

interface ComparisonJobCommon {
  jobId: string;
  iTwinId: string;
  iModelId: string;
  startChangesetId?: string;
  endChangesetId?: string;
  startChangesetIndex?: number;
  endChangesetIndex?: number;
  diffingPlan?: {
    strategy: DiffingStrategy;
  };
}

export interface ComparisonJobCompleted {
  comparisonJob: ComparisonJobCommon & {
    status: "Completed";
    comparison: {
      href: string;
    };
  };
}

export interface ComparisonJobStarted {
  comparisonJob: ComparisonJobCommon & {
    status: "Started";
    currentProgress: number;
    maxProgress: number;
    completedAgents?: number;
    totalAgents?: number;
  };
}

export interface ComparisonJobQueued {
  comparisonJob: ComparisonJobCommon & {
    status: "Queued";
  };
}

export interface ComparisonJobFailed {
  comparisonJob: ComparisonJobCommon & {
    status: "Failed";
    errorDetails: string;
  };
}

export interface GetComparisonJobResultParams extends BodilessRequest {
  comparisonJob: ComparisonJobCompleted["comparisonJob"];
}

export interface ChangedElementsPayload {
  changedElements: ChangedElements;
}

interface PostComparisonJobParamsBase extends BodilessRequest {
  iTwinId: string;
  iModelId: string;
  diffingStrategy?: DiffingStrategy;
}

export interface PostComparisonJobParamsWithIds extends PostComparisonJobParamsBase {
  startChangesetId: string;
  endChangesetId: string;
  startChangesetIndex?: never;
  endChangesetIndex?: never;
}

export interface PostComparisonJobParamsWithIndexes extends PostComparisonJobParamsBase {
  startChangesetIndex: number;
  endChangesetIndex: number;
  startChangesetId?: string;
  endChangesetId?: string;
}

export type PostComparisonJobParams = PostComparisonJobParamsWithIds | PostComparisonJobParamsWithIndexes;

export interface CommonRequestParams {
  signal?: AbortSignal | undefined;
  headers?: Record<string, string> | undefined;
  body?: Record<string, unknown> | undefined;
}

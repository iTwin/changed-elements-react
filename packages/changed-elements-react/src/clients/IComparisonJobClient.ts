/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ChangedElements as IChangedElements } from "@itwin/core-common";

export interface IComparisonJobClient {
  /** Gets comparison job status. Throws on encountering an error or receiving non-success response code. */
  getComparisonJob(args: GetComparisonJobParams): Promise<ComparisonJob>;

  /** Deletes comparison job status. Throws on encountering an error or receiving non-success response code. */
  deleteComparisonJob(args: GetComparisonJobParams): Promise<void>;

  /** Gets changed elements based on a provided complete comparison job. Throws on encountering an error or receiving non-success response code. */
  getComparisonJobResult(args: GetComparisonJobResultParams): Promise<ChangedElements>;

  /** Starts comparison job. Throws on encountering an error or receiving non-success response code. */
  postComparisonJob(args: PostComparisonJobParams): Promise<ComparisonJob>;

}

type BodilessRequest = Omit<CommonRequestParams, "body">

export interface GetComparisonJobParams extends BodilessRequest {
  iTwinId: string;
  iModelId: string;
  jobId: string;
}

export interface DeleteComparisonJobParams extends GetComparisonJobParams { }

export type ComparisonJob = ComparisonJobCompleted | ComparisonJobStarted | ComparisonJobQueued | ComparisonJobFailed;

export interface ComparisonJobCompleted {
  comparisonJob: {
    status: "Completed";
    jobId: string;
    iTwinId: string;
    iModelId: string;
    startChangesetId: string;
    endChangesetId: string;
    comparison: {
      href: string;
    };
  };
}

export interface ComparisonJobStarted {
  comparisonJob: {
    status: "Started";
    jobId: string;
    iTwinId: string;
    iModelId: string;
    startChangesetId: string;
    endChangesetId: string;
    currentProgress: number;
    maxProgress: number;
  };
}

export interface ComparisonJobQueued {
  comparisonJob: {
    status: "Queued";
    jobId: string;
    iTwinId: string;
    iModelId: string;
    startChangesetId: string;
    endChangesetId: string;
  };
}

export interface ComparisonJobFailed {
  comparisonJob: {
    status: "Error";
    jobId: string;
    iTwinId: string;
    iModelId: string;
    startChangesetId: string;
    endChangesetId: string;
    errorDetails: string;
  };
}

export interface GetComparisonJobResultParams extends BodilessRequest {
  comparisonJob: ComparisonJobCompleted["comparisonJob"];
}

export interface ChangedElements {
  changedElements: IChangedElements;
}

export interface PostComparisonJobParams extends BodilessRequest {
  iTwinId: string;
  iModelId: string;
  startChangesetId: string;
  endChangesetId: string;
}

export interface CommonRequestParams {
  signal?: AbortSignal | undefined;
  headers?: Record<string, string> | undefined;
  body?: Record<string, unknown> | undefined;
}

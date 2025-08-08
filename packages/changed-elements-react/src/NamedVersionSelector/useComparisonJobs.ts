/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { useCallback } from "react";

import type { ComparisonJob, IComparisonJobClient } from "../clients/IComparisonJobClient.js";
import type { NamedVersion } from "../clients/iModelsClient.js";
import { tryXTimes } from "../utils/utils.js";
import { useVersionCompare } from "../VersionCompareContext.js";
import type { ComparisonJobStatus, NamedVersionEntry } from "./useNamedVersionsList.js";

interface UseComparisonJobsArgs {
  iTwinId: string;
  iModelId: string;
  currentNamedVersion: NamedVersion;
  entries: NamedVersionEntry[];
}

interface UseComparisonJobsResult {
  /** Inquires `IComparisonJobClient` about current status of the job. */
  queryJobStatus: (targetVersionId: string, signal?: AbortSignal) => Promise<ComparisonJobStatus | undefined>;

  /**
   * Starts comparison job if one is not running already.
   * @returns A promise that resolves to the job status and a generator function
   *          that queries the current job status with each invocation.
   */
  startJob: (
    namedVersion: NamedVersion & { targetChangesetId: string; },
    signal?: AbortSignal,
  ) => Promise<{
    job: ComparisonJobStatus;
    watchJob: (
      pollingIntervalMs: number,
      signal?: AbortSignal,
    ) => AsyncGenerator<ComparisonJobStatus>;
  }>;
}

/** Provides memoized utility functions to manipulate comparison jobs. */
export function useComparisonJobs(args: UseComparisonJobsArgs): UseComparisonJobsResult {
  const { comparisonJobClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client is not initialized in given context.");
  }

  const { iTwinId, iModelId, currentNamedVersion, entries } = args;

  const queryJobStatus = useCallback(
    async (targetVersionId: string, signal?: AbortSignal) => {
      signal?.throwIfAborted();
      if (entries.length === 0) {
        return undefined;
      }
      const entry = entries.find((entry) => entry.namedVersion.id === targetVersionId);
      if (!entry) {
        throw new Error(`Could not find named version entry: '${targetVersionId}'`);
      }

      const jobId = `${entry.namedVersion.targetChangesetId}-${currentNamedVersion.changesetId}`;
      const comparisonJob = await getComparisonJob({
        comparisonJobClient,
        iTwinId,
        iModelId,
        jobId,
        signal,
      });
      return comparisonJobToStatus(comparisonJob ?? jobId, { id: targetVersionId });
    },
    [comparisonJobClient, currentNamedVersion.changesetId, entries, iModelId, iTwinId],
  );

  const startJob = useCallback(
    async (
      namedVersion: NamedVersion & { targetChangesetId: string; },
      signal?: AbortSignal) => {
      signal?.throwIfAborted();

      const comparisonJob = await postOrGetComparisonJob({
        comparisonJobClient,
        iTwinId,
        iModelId,
        startChangesetId: namedVersion.targetChangesetId,
        endChangesetId: currentNamedVersion.changesetId as string,
        signal,
      });

      let job = comparisonJobToStatus(comparisonJob, namedVersion);
      return {
        job,
        watchJob: async function* (pollingIntervalMs: number, signal?: AbortSignal) {
          signal?.throwIfAborted();
          while (job.status === "Queued" || job.status === "Started") {
            await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
            const comparisonJob = await getComparisonJob({
              comparisonJobClient,
              iTwinId,
              iModelId,
              jobId: job.jobId,
              signal,
            });
            job = comparisonJobToStatus(comparisonJob ?? job.jobId, namedVersion);
            yield job;
          }
        },
      };
    },
    [comparisonJobClient, currentNamedVersion.changesetId, iModelId, iTwinId],
  );

  return { queryJobStatus, startJob };
}

function comparisonJobToStatus(
  comparisonJob: ComparisonJob | string,
  namedVersion: Pick<NamedVersion, "id">,
): ComparisonJobStatus {
  if (typeof comparisonJob === "string") {
    return {
      jobId: comparisonJob,
      namedVersionId: namedVersion.id,
      status: "NotStarted",
    };
  }

  comparisonJob.comparisonJob;
  const job = comparisonJob.comparisonJob;

  switch (job.status) {
    case "Queued":
      return {
        jobId: job.jobId,
        namedVersionId: namedVersion.id,
        status: "Queued",
      };

    case "Started":
      return {
        jobId: job.jobId,
        namedVersionId: namedVersion.id,
        status: "Started",
        progress: {
          current: job.currentProgress,
          max: job.maxProgress,
        },
      };

    case "Completed":
      return {
        jobId: job.jobId,
        namedVersionId: namedVersion.id,
        status: "Completed",
        comparisonUrl: job.comparison.href,
      };

    case "Failed":
    default:
      return {
        jobId: job.jobId,
        namedVersionId: namedVersion.id,
        status: "Failed",
        errorDetails: job.errorDetails,
      };
  }
}

interface PostOrGetComparisonJobParams {
  comparisonJobClient: IComparisonJobClient;
  iTwinId: string;
  iModelId: string;
  startChangesetId: string;
  endChangesetId: string;
  signal?: AbortSignal;
}

async function postOrGetComparisonJob(args: PostOrGetComparisonJobParams): Promise<ComparisonJob> {
  const numRetries = 3;
  const delayInMilliseconds = 5000;
  const { comparisonJobClient, iTwinId, iModelId, startChangesetId, endChangesetId, signal } = args;
  const jobId = `${startChangesetId}-${endChangesetId}`;
  signal?.throwIfAborted();

  const runGetDeletePostJobWorkflow = async () => {
    const response = await getComparisonJob({
      comparisonJobClient,
      iTwinId,
      iModelId,
      jobId: jobId,
      signal,
    });

    if (response?.comparisonJob?.status === "Failed") {
      await args.comparisonJobClient.deleteComparisonJob({
        iTwinId: iTwinId,
        iModelId: iModelId,
        jobId: jobId,
      });
      return comparisonJobClient.postComparisonJob({
        iTwinId,
        iModelId,
        startChangesetId: startChangesetId,
        endChangesetId: endChangesetId,
        headers: { "Content-Type": "application/json" },
        signal,
      });
    }

    return response ??
      comparisonJobClient.postComparisonJob({
        iTwinId,
        iModelId,
        startChangesetId: startChangesetId,
        endChangesetId: endChangesetId,
        headers: { "Content-Type": "application/json" },
        signal,
      });
  };
  return tryXTimes(() => runGetDeletePostJobWorkflow(), numRetries, delayInMilliseconds, signal);
}

interface GetComparisonJobArgs {
  comparisonJobClient: IComparisonJobClient;
  iTwinId: string;
  iModelId: string;
  jobId: string;
  signal?: AbortSignal | undefined;
}

async function getComparisonJob(args: GetComparisonJobArgs): Promise<ComparisonJob | undefined> {
  const { comparisonJobClient, iTwinId, iModelId, jobId, signal } = args;
  signal?.throwIfAborted();

  try {
    const result = await comparisonJobClient.getComparisonJob({
      iTwinId,
      iModelId,
      jobId,
      headers: { "Content-Type": "application/json" },
      signal,
    });
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    if (isComparisonNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isComparisonNotFoundError(error: unknown): boolean {
  return !!(
    error && typeof error === "object" && "code" in error && error.code === "ComparisonNotFound"
  );
}

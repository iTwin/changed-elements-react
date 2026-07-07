/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  ChangedElementsPayload, ComparisonJob, DeleteComparisonJobParams, DiffingStrategy, GetComparisonJobParams,
  GetComparisonJobResultParams, IComparisonJobClient, PostComparisonJobParams
} from "./IComparisonJobClient.js";
import type { IModelsClient } from "./iModelsClient.js";
import { callITwinApi, throwBadResponseCodeError } from "./iTwinApi.js";

/**
 * Structured error thrown when a requested diff job cannot be found.
 * Satisfies the `{ code: "ComparisonNotFound" }` contract checked by callers.
 */
class ComparisonNotFoundError extends Error {
  public readonly code = "ComparisonNotFound" as const;
  constructor(message: string) {
    super(message);
    this.name = "ComparisonNotFoundError";
  }
}

export interface DiffJobClientParams {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  iModelsClient: IModelsClient;
  diffingStrategy?: DiffingStrategy;
}

type DiffJob = {
  jobId: string;
  status: "Queued" | "Started" | "Completed" | "Failed";
  iTwinId: string;
  iModelId: string;
  startChangesetIndex: number;
  endChangesetIndex: number;
  diffingPlan?: {
    strategy?: string;
  };
  diffingStrategy?: string;
  href?: string;
  error?: string;
  completedAgents?: number;
  totalAgents?: number;
};

type DiffJobResponse = {
  job: DiffJob;
};

type DiffJobListResponse = {
  jobs: DiffJob[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DiffJobClient implements IComparisonJobClient {
  public readonly apiVersion = "v3" as const;
  private static readonly _acceptHeader = "application/vnd.bentley.itwin-platform.v3+json";
  private readonly _baseUrl: string;
  private readonly _getAccessToken: () => Promise<string>;
  private readonly _iModelsClient: IModelsClient;
  private readonly _diffingStrategy: DiffingStrategy;
  private readonly _changesetIndexCache = new Map<string, number>();
  private readonly _compositeJobStrategyCache = new Map<string, DiffingStrategy>();

  constructor(args: DiffJobClientParams) {
    this._baseUrl = args.baseUrl;
    this._getAccessToken = args.getAccessToken;
    this._iModelsClient = args.iModelsClient;
    this._diffingStrategy = args.diffingStrategy ?? "VersionCompare";
  }

  public async getComparisonJob(args: GetComparisonJobParams): Promise<ComparisonJob> {
    try {
      if (uuidPattern.test(args.jobId)) {
        const response = await callITwinApi({
          url: this._buildJobUrl(args.jobId, args.iTwinId, args.iModelId),
          method: "GET",
          getAccessToken: this._getAccessToken,
          signal: args.signal,
          headers: {
            Accept: DiffJobClient._acceptHeader,
            ...args.headers,
          },
        }) as unknown as DiffJobResponse;
        return this._normalizeJob(response.job);
      }

      const pair = await this._resolveCompositeJobId(args.iModelId, args.jobId);
      if (!pair) {
        throw new ComparisonNotFoundError(`Unsupported job identifier format: ${args.jobId}`);
      }

      const preferredStrategy = this._getPreferredStrategy(args.jobId);

      let listResponse = await this._listDiffJobs({
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetIndex: pair.startChangesetIndex,
        endChangesetIndex: pair.endChangesetIndex,
        diffingStrategy: preferredStrategy,
        signal: args.signal,
        headers: args.headers,
      });

      let firstJob = listResponse.jobs.find((job) => this._isMatchingStrategy(job, preferredStrategy));
      if (!firstJob) {
        // Fall back to an unfiltered list query to avoid missing jobs created with a non-default strategy.
        listResponse = await this._listDiffJobs({
          iTwinId: args.iTwinId,
          iModelId: args.iModelId,
          startChangesetIndex: pair.startChangesetIndex,
          endChangesetIndex: pair.endChangesetIndex,
          signal: args.signal,
          headers: args.headers,
        });
        firstJob = this._pickBestStrategyMatch(listResponse.jobs, preferredStrategy);
      }

      if (!firstJob) {
        throw new ComparisonNotFoundError("Requested comparison is not available.");
      }

      const detailedResponse = await callITwinApi({
        url: this._buildJobUrl(firstJob.jobId, args.iTwinId, args.iModelId),
        method: "GET",
        getAccessToken: this._getAccessToken,
        signal: args.signal,
        headers: {
          Accept: DiffJobClient._acceptHeader,
          ...args.headers,
        },
      }) as unknown as DiffJobResponse;

      return this._normalizeJob(detailedResponse.job, pair.startChangesetId, pair.endChangesetId);
    } catch (error: unknown) {
      throw this._normalizeNotFoundError(error);
    }
  }

  public async deleteComparisonJob(args: DeleteComparisonJobParams): Promise<void> {
    let jobId = args.jobId;
    if (!uuidPattern.test(jobId)) {
      const pair = await this._resolveCompositeJobId(args.iModelId, jobId);
      if (!pair) {
        throw new ComparisonNotFoundError(`Unsupported job identifier format: ${jobId}`);
      }
      const preferredStrategy = this._getPreferredStrategy(jobId);
      let listResponse = await this._listDiffJobs({
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetIndex: pair.startChangesetIndex,
        endChangesetIndex: pair.endChangesetIndex,
        diffingStrategy: preferredStrategy,
        signal: args.signal,
        headers: args.headers,
      });

      let match = listResponse.jobs.find((job) => this._isMatchingStrategy(job, preferredStrategy));
      if (!match) {
        listResponse = await this._listDiffJobs({
          iTwinId: args.iTwinId,
          iModelId: args.iModelId,
          startChangesetIndex: pair.startChangesetIndex,
          endChangesetIndex: pair.endChangesetIndex,
          signal: args.signal,
          headers: args.headers,
        });
        match = this._pickBestStrategyMatch(listResponse.jobs, preferredStrategy);
      }

      if (!match) {
        throw new ComparisonNotFoundError("Requested comparison is not available.");
      }
      jobId = match.jobId;
    }

    try {
      await callITwinApi({
        url: this._buildJobUrl(jobId, args.iTwinId, args.iModelId),
        method: "DELETE",
        getAccessToken: this._getAccessToken,
        signal: args.signal,
        headers: {
          Accept: DiffJobClient._acceptHeader,
          ...args.headers,
        },
      });
    } catch (error: unknown) {
      throw this._normalizeNotFoundError(error);
    }
  }

  public async getComparisonJobResult(args: GetComparisonJobResultParams): Promise<ChangedElementsPayload> {
    // The href is a pre-signed URL (e.g. Azure Blob SAS URL); no Authorization header is needed or wanted.
    const response = await fetch(
      args.comparisonJob.comparison.href,
      {
        method: "GET",
        signal: args.signal,
        headers: {
          Accept: DiffJobClient._acceptHeader,
        },
      },
    );

    if (!response.ok) {
      await throwBadResponseCodeError(response, "Changed Elements request failed.");
    }
    return response.json() as unknown as Promise<ChangedElementsPayload>;
  }

  public async postComparisonJob(args: PostComparisonJobParams): Promise<ComparisonJob> {
    const startChangesetIndex = args.startChangesetIndex ??
      await this._resolveChangesetIndex(args.iModelId, args.startChangesetId);
    const endChangesetIndex = args.endChangesetIndex ??
      await this._resolveChangesetIndex(args.iModelId, args.endChangesetId);

    const requestedStrategy = args.diffingStrategy ?? this._diffingStrategy;

    const response = await callITwinApi({
      url: `${this._baseUrl}/diff`,
      method: "POST",
      getAccessToken: this._getAccessToken,
      signal: args.signal,
      headers: {
        Accept: DiffJobClient._acceptHeader,
        ...args.headers,
      },
      body: {
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetIndex,
        endChangesetIndex,
        diffingPlan: {
          strategy: requestedStrategy,
        },
      },
    }) as unknown as DiffJobResponse;

    if (args.startChangesetId && args.endChangesetId) {
      this._compositeJobStrategyCache.set(`${args.startChangesetId}-${args.endChangesetId}`, requestedStrategy);
    }

    return this._normalizeJob(response.job, args.startChangesetId, args.endChangesetId);
  }

  private async _resolveChangesetIndex(iModelId: string, changesetId: string | undefined): Promise<number> {
    if (!changesetId) {
      throw new Error("Missing required changeset identifier.");
    }

    const cacheKey = `${iModelId}:${changesetId}`;
    const cached = this._changesetIndexCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const changeset = await this._iModelsClient.getChangeset({
      iModelId,
      changesetId,
    });
    if (!changeset) {
      throw new ComparisonNotFoundError(`Could not resolve changeset index for '${changesetId}'.`);
    }

    this._changesetIndexCache.set(cacheKey, changeset.index);
    return changeset.index;
  }

  private _normalizeJob(job: DiffJob, startChangesetId?: string, endChangesetId?: string): ComparisonJob {
    const common = {
      jobId: job.jobId,
      iTwinId: job.iTwinId,
      iModelId: job.iModelId,
      startChangesetId,
      endChangesetId,
      startChangesetIndex: job.startChangesetIndex,
      endChangesetIndex: job.endChangesetIndex,
      diffingPlan: {
        strategy: this._normalizeStrategy(job.diffingPlan?.strategy) ?? this._diffingStrategy,
      },
    };

    switch (job.status) {
      case "Completed":
        if (!job.href) {
          throw new Error(`Completed diff job '${job.jobId}' is missing required href.`);
        }
        return {
          comparisonJob: {
            ...common,
            status: "Completed",
            comparison: {
              href: job.href,
            },
          },
        };
      case "Started":
        return {
          comparisonJob: {
            ...common,
            status: "Started",
            completedAgents: job.completedAgents,
            totalAgents: job.totalAgents,
            currentProgress: job.completedAgents ?? 0,
            maxProgress: job.totalAgents ?? 0,
          },
        };
      case "Failed":
        return {
          comparisonJob: {
            ...common,
            status: "Failed",
            errorDetails: job.error ?? "Diff job failed.",
          },
        };
      case "Queued":
        return {
          comparisonJob: {
            ...common,
            status: "Queued",
          },
        };
      default:
        throw new Error(`Received unsupported diff job status '${String(job.status)}'.`);
    }
  }

  private async _resolveCompositeJobId(
    iModelId: string,
    jobId: string,
  ): Promise<{
    startChangesetId: string;
    endChangesetId: string;
    startChangesetIndex: number;
    endChangesetIndex: number;
  } | undefined> {
    const separatorIndexes: number[] = [];
    for (let i = 0; i < jobId.length; i++) {
      if (jobId[i] === "-") {
        separatorIndexes.push(i);
      }
    }

    if (separatorIndexes.length === 0) {
      return undefined;
    }

    // Sort candidates by distance from the midpoint so that equal-length ID pairs
    // (e.g. two UUIDs or two SHA-1 hashes) are resolved in a single attempt rather
    // than scanning from the leftmost dash inward.
    const midpoint = (jobId.length - 1) / 2;
    const sorted = separatorIndexes.slice().sort(
      (a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint),
    );

    // We try every possible split to support opaque changeset ids.
    for (const splitIndex of sorted) {
      const startChangesetId = jobId.slice(0, splitIndex);
      const endChangesetId = jobId.slice(splitIndex + 1);
      if (!startChangesetId || !endChangesetId) {
        continue;
      }

      try {
        const startChangesetIndex = await this._resolveChangesetIndex(iModelId, startChangesetId);
        const endChangesetIndex = await this._resolveChangesetIndex(iModelId, endChangesetId);
        return {
          startChangesetId,
          endChangesetId,
          startChangesetIndex,
          endChangesetIndex,
        };
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error
          ? (error as Record<string, unknown>).code
          : undefined;
        if (code === "ComparisonNotFound") {
          // Try next split candidate when one side of the split does not resolve.
          continue;
        }

        throw error;
      }
    }

    return undefined;
  }

  private async _listDiffJobs(args: {
    iTwinId: string;
    iModelId: string;
    startChangesetIndex: number;
    endChangesetIndex: number;
    diffingStrategy?: DiffingStrategy;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<DiffJobListResponse> {
    const url = new URL(`${this._baseUrl}/diff`);
    url.searchParams.set("iTwinId", args.iTwinId);
    url.searchParams.set("iModelId", args.iModelId);
    url.searchParams.set("startChangesetIndex", String(args.startChangesetIndex));
    url.searchParams.set("endChangesetIndex", String(args.endChangesetIndex));
    if (args.diffingStrategy) {
      url.searchParams.set("diffingStrategy", args.diffingStrategy);
    }

    return callITwinApi({
      url: url.toString(),
      method: "GET",
      getAccessToken: this._getAccessToken,
      signal: args.signal,
      headers: {
        Accept: DiffJobClient._acceptHeader,
        ...args.headers,
      },
    }) as unknown as Promise<DiffJobListResponse>;
  }

  private _buildJobUrl(jobId: string, iTwinId: string, iModelId: string): string {
    const url = new URL(`${this._baseUrl}/diff/${encodeURIComponent(jobId)}`);
    url.searchParams.set("iTwinId", iTwinId);
    url.searchParams.set("iModelId", iModelId);
    return url.toString();
  }

  private _getPreferredStrategy(jobId: string): DiffingStrategy {
    return this._compositeJobStrategyCache.get(jobId) ?? this._diffingStrategy;
  }

  private _pickBestStrategyMatch(jobs: DiffJob[], preferredStrategy: DiffingStrategy): DiffJob | undefined {
    return jobs.find((job) => this._isMatchingStrategy(job, preferredStrategy))
      ?? jobs.find((job) => this._isMatchingStrategy(job, this._diffingStrategy));
  }

  private _isMatchingStrategy(job: DiffJob, strategy: DiffingStrategy): boolean {
    return this._normalizeStrategy(job.diffingPlan?.strategy ?? job.diffingStrategy) === strategy;
  }

  private _normalizeStrategy(strategy: string | undefined): DiffingStrategy | undefined {
    switch (strategy?.toLowerCase()) {
      case "basic": return "Basic";
      case "full": return "Full";
      case "versioncompare": return "VersionCompare";
      default: return undefined;
    }
  }

  private _normalizeNotFoundError(error: unknown): unknown {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as Record<string, unknown>).code;
      if (code === "DiffJobNotFound") {
        const rawMessage = (error as Record<string, unknown>).message;
        const message = typeof rawMessage === "string" ? rawMessage : "Requested comparison is not available.";
        return new ComparisonNotFoundError(message);
      }
    }

    return error;
  }
}

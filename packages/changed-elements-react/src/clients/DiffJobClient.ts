/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  ChangedElementsPayload, ComparisonJob, DeleteComparisonJobParams, DiffingStrategy, GetComparisonJobParams,
  GetComparisonJobResultParams, IComparisonJobClient, PostComparisonJobParams, PostComparisonJobParamsWithIds,
  PostComparisonJobParamsWithIndexes
} from "./IComparisonJobClient.js";
import type { IModelsClient } from "./iModelsClient.js";
import { callITwinApi, throwBadResponseCodeError } from "./iTwinApi.js";
import { isChangedElementsPayload, isRecord } from "./typeGuards.js";

/**
 * Structured error thrown when a requested diff job cannot be found.
 * Satisfies the `{ code: "ComparisonNotFound" }` contract checked by callers.
 */
class ComparisonNotFoundError extends Error {
  /** Discriminant used by callers to detect this error type without an `instanceof` check across module boundaries. */
  public readonly code = "ComparisonNotFound" as const;

  /** @param message Human-readable description of why the comparison could not be found. */
  constructor(message: string) {
    super(message);
    this.name = "ComparisonNotFoundError";
  }
}

/** Constructor parameters for {@link DiffJobClient}. */
export interface DiffJobClientParams {
  /** Base URL of the Changed Elements v3 (diff) API. */
  baseUrl: string;

  /** Callback that resolves the access token used to authenticate API requests. */
  getAccessToken: () => Promise<string>;

  /** Client used to resolve changeset ids to changeset indexes. */
  iModelsClient: IModelsClient;

  /** Diffing strategy requested when creating new diff jobs. Defaults to `"VersionCompare"`. */
  diffingStrategy?: DiffingStrategy;
}

/** Raw diff job shape as returned by the Changed Elements v3 (diff) API. */
type DiffJob = {
  /** Unique identifier of the diff job. */
  jobId: string;

  /** Current processing status of the diff job. */
  status: "Queued" | "Started" | "Completed" | "Failed";

  /** iTwin id the diff job belongs to. */
  iTwinId: string;

  /** iModel id the diff job belongs to. */
  iModelId: string;

  /** Changeset index the comparison starts from. */
  startChangesetIndex: number;

  /** Changeset index the comparison ends at. */
  endChangesetIndex: number;

  /** Diffing plan used to create the job, if reported by the API. */
  diffingPlan?: {
    /** Raw (non-normalized) strategy name. */
    strategy?: string;
  };

  /** Raw (non-normalized) strategy name, reported directly on the job by some API versions. */
  diffingStrategy?: string;

  /** Pre-signed URL to the diff result. Present once the job status is `"Completed"`. */
  href?: string;

  /** Error message. Present when the job status is `"Failed"`. */
  error?: string;

  /** Number of diff agents that have finished processing. Present while the job is `"Started"`. */
  completedAgents?: number;

  /** Total number of diff agents assigned to the job. Present while the job is `"Started"`. */
  totalAgents?: number;
};

/** Response body of a single diff job request (`GET`/`POST .../diff/{jobId}`). */
type DiffJobResponse = {
  /** The diff job returned by the API. */
  job: DiffJob;
};

/** Response body of a diff job list request (`GET .../diff`). */
type DiffJobListResponse = {
  /** Diff jobs matching the list query. */
  jobs: DiffJob[];
};

/**
 * Type guard validating the shape of a raw {@link DiffJob} returned by the API.
 *
 * `status` is intentionally only checked to be a string here (not restricted to the known status
 * literals): unrecognized status values are a valid API response and are rejected with a
 * specific "unsupported diff job status" error by `DiffJobClient`'s private `_normalizeJob` instead.
 * @param value Unknown value to validate.
 */
function isDiffJob(value: unknown): value is DiffJob {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    typeof value.status === "string" &&
    typeof value.iTwinId === "string" &&
    typeof value.iModelId === "string" &&
    typeof value.startChangesetIndex === "number" &&
    typeof value.endChangesetIndex === "number"
  );
}

/**
 * Type guard validating the shape of a {@link DiffJobResponse}.
 * @param value Unknown value to validate.
 */
function isDiffJobResponse(value: unknown): value is DiffJobResponse {
  return isRecord(value) && isDiffJob(value.job);
}

/**
 * Type guard validating the shape of a {@link DiffJobListResponse}.
 * @param value Unknown value to validate.
 */
function isDiffJobListResponse(value: unknown): value is DiffJobListResponse {
  return isRecord(value) && Array.isArray(value.jobs) && value.jobs.every(isDiffJob);
}

/** Matches a RFC 4122 v1-v5 UUID string, used to distinguish real diff job ids from composite (changeset pair) ids. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `IComparisonJobClient` implementation backed by the Changed Elements v3 (diff) API.
 *
 * Unlike {@link ComparisonJobClient} (v2), this client accepts composite job ids of the form
 * `${startChangesetId}-${endChangesetId}` in addition to real diff job UUIDs, resolving them to
 * changeset indexes via the provided `IModelsClient` and caching the results.
 */
export class DiffJobClient implements IComparisonJobClient {
  /** Indicates this client targets the Changed Elements v3 API. */
  public readonly apiVersion = "v3" as const;
  private static readonly _acceptHeader = "application/vnd.bentley.itwin-platform.v3+json";

  /** Base URL of the Changed Elements v3 (diff) API. */
  private readonly _baseUrl: string;

  /** Resolves the access token used to authenticate API requests. */
  private readonly _getAccessToken: () => Promise<string>;

  /** Client used to resolve changeset ids to changeset indexes. */
  private readonly _iModelsClient: IModelsClient;

  /** Default diffing strategy requested when creating new diff jobs. */
  private readonly _diffingStrategy: DiffingStrategy;

  /** Caches resolved changeset indexes, keyed by `${iModelId}:${changesetId}`. */
  private readonly _changesetIndexCache = new Map<string, number>();

  /** Caches the diffing strategy used for composite job ids, keyed by `${startChangesetId}-${endChangesetId}`. */
  private readonly _compositeJobStrategyCache = new Map<string, DiffingStrategy>();

  /** @param args Constructor parameters, see {@link DiffJobClientParams}. */
  constructor(args: DiffJobClientParams) {
    this._baseUrl = args.baseUrl;
    this._getAccessToken = args.getAccessToken;
    this._iModelsClient = args.iModelsClient;
    this._diffingStrategy = args.diffingStrategy ?? "VersionCompare";
  }

  /**
   * Gets comparison job status.
   *
   * Accepts either a real diff job UUID, or a composite id of the form
   * `${startChangesetId}-${endChangesetId}`, which is resolved to the matching diff job.
   * @param args iTwin/iModel/job identification and request options.
   * @returns ComparisonJob
   * @throws a `ComparisonNotFoundError` (`{ code: "ComparisonNotFound" }`) if no matching job is found, or on any other non-2XX response.
   */
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
          validate: isDiffJobResponse,
        });
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
        validate: isDiffJobResponse,
      });

      return this._normalizeJob(detailedResponse.job, pair.startChangesetId, pair.endChangesetId);
    } catch (error: unknown) {
      throw this._normalizeNotFoundError(error);
    }
  }

  /**
   * Deletes comparison job.
   *
   * Accepts either a real diff job UUID, or a composite id of the form
   * `${startChangesetId}-${endChangesetId}`, which is resolved to the matching diff job before deletion.
   * @param args iTwin/iModel/job identification and request options.
   * @returns void
   * @throws a `ComparisonNotFoundError` (`{ code: "ComparisonNotFound" }`) if no matching job is found, or on any other non-2XX response.
   */
  public async deleteComparisonJob(args: DeleteComparisonJobParams): Promise<void> {
    try {
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

  /**
   * Gets changed elements for given comparisonJob.
   * @param args The comparison job whose result should be fetched, plus request options.
   * @returns ChangedElements
   * @throws on a non 2XX response, or if the response body does not match the expected shape.
   */
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

    const body: unknown = await response.json();
    if (!isChangedElementsPayload(body)) {
      throw new Error(`Changed Elements request to ${args.comparisonJob.comparison.href} returned an unexpected response shape.`);
    }

    return body;
  }

  /**
   * Starts comparison job using changeset ids.
   *
   * Ids are resolved to changeset indexes (and cached) via the `IModelsClient`.
   * @param args iTwin/iModel identification, changeset ids, diffing strategy, and request options.
   * @returns ComparisonJob
   * @throws on a non 2XX response.
   */
  public async postComparisonJob(args: PostComparisonJobParamsWithIds): Promise<ComparisonJob>;
  /**
   * Starts comparison job using explicit changeset indexes.
   * @param args iTwin/iModel identification, changeset indexes, diffing strategy, and request options.
   * @returns ComparisonJob
   * @throws on a non 2XX response.
   */
  public async postComparisonJob(args: PostComparisonJobParamsWithIndexes): Promise<ComparisonJob>;
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
      validate: isDiffJobResponse,
    });

    if (args.startChangesetId && args.endChangesetId) {
      this._compositeJobStrategyCache.set(`${args.startChangesetId}-${args.endChangesetId}`, requestedStrategy);
    }

    return this._normalizeJob(response.job, args.startChangesetId, args.endChangesetId);
  }

  /**
   * Resolves a changeset id to its numeric changeset index via the `IModelsClient`, caching the result.
   * @param iModelId iModel the changeset belongs to.
   * @param changesetId Changeset id to resolve, or `undefined`.
   * @throws if `changesetId` is undefined, or if the changeset cannot be found (as a `ComparisonNotFoundError`).
   */
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

  /**
   * Converts a raw {@link DiffJob} (v3 API shape) into the public, discriminated-union `ComparisonJob` shape.
   * @param job Raw diff job to normalize.
   * @param startChangesetId Changeset id the comparison starts from, if known (e.g. from a composite job id).
   * @param endChangesetId Changeset id the comparison ends at, if known (e.g. from a composite job id).
   * @throws if `job.status` is `"Completed"` but missing its result `href`, or if `job.status` is not a recognized value.
   */
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
        strategy: this._normalizeStrategy(job.diffingPlan?.strategy ?? job.diffingStrategy) ?? this._diffingStrategy,
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

  /**
   * Attempts to split a composite job id (`${startChangesetId}-${endChangesetId}`) into its two
   * changeset ids and resolve both to changeset indexes, trying every dash as a possible split
   * point (starting from the one closest to the midpoint) to support opaque changeset ids that
   * may themselves contain dashes.
   * @param iModelId iModel the changesets belong to.
   * @param jobId Composite job id of the form `${startChangesetId}-${endChangesetId}`.
   * @returns The resolved changeset id/index pair, or `undefined` if `jobId` has no dashes or no split resolves successfully.
   */
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

  /**
   * Lists diff jobs matching the given iTwin/iModel/changeset-range (and optionally strategy) query.
   * @param args iTwin/iModel identification, changeset index range, optional diffing strategy filter, and request options.
   * @throws on a non 2XX response, or if the response body does not match the expected shape.
   */
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
      validate: isDiffJobListResponse,
    });
  }

  /**
   * Builds the URL for a single diff job resource (`.../diff/{jobId}?iTwinId=...&iModelId=...`).
   * @param jobId Diff job id.
   * @param iTwinId iTwin id the job belongs to.
   * @param iModelId iModel id the job belongs to.
   */
  private _buildJobUrl(jobId: string, iTwinId: string, iModelId: string): string {
    const url = new URL(`${this._baseUrl}/diff/${encodeURIComponent(jobId)}`);
    url.searchParams.set("iTwinId", iTwinId);
    url.searchParams.set("iModelId", iModelId);
    return url.toString();
  }

  /**
   * Returns the diffing strategy previously used for a composite job id, falling back to the client's default.
   * @param jobId Composite job id previously passed to {@link DiffJobClient.postComparisonJob}.
   */
  private _getPreferredStrategy(jobId: string): DiffingStrategy {
    return this._compositeJobStrategyCache.get(jobId) ?? this._diffingStrategy;
  }

  /**
   * Picks the best matching job from an unfiltered job list: prefers a job matching
   * `preferredStrategy`, falling back to one matching the client's default strategy.
   * @param jobs Candidate jobs to search.
   * @param preferredStrategy Diffing strategy to prefer.
   */
  private _pickBestStrategyMatch(jobs: DiffJob[], preferredStrategy: DiffingStrategy): DiffJob | undefined {
    return jobs.find((job) => this._isMatchingStrategy(job, preferredStrategy))
      ?? jobs.find((job) => this._isMatchingStrategy(job, this._diffingStrategy));
  }

  /**
   * Checks whether a job's (normalized) diffing strategy matches `strategy`.
   * @param job Job to check.
   * @param strategy Diffing strategy to compare against.
   */
  private _isMatchingStrategy(job: DiffJob, strategy: DiffingStrategy): boolean {
    return this._normalizeStrategy(job.diffingPlan?.strategy ?? job.diffingStrategy) === strategy;
  }

  /**
   * Normalizes a raw, case-insensitive strategy string from the API into a `DiffingStrategy`, or `undefined` if unrecognized.
   * @param strategy Raw strategy string reported by the API, or `undefined`.
   */
  private _normalizeStrategy(strategy: string | undefined): DiffingStrategy | undefined {
    switch (strategy?.toLowerCase()) {
      case "basic": return "Basic";
      case "full": return "Full";
      case "versioncompare": return "VersionCompare";
      default: return undefined;
    }
  }

  /**
   * Converts a `{ code: "DiffJobNotFound" }` error from the API into a `ComparisonNotFoundError`; other errors are passed through unchanged.
   * @param error Error caught from an API call.
   */
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

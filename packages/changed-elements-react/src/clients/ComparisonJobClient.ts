/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  ChangedElementsPayload, IComparisonJobClient, ComparisonJob, GetComparisonJobParams, GetComparisonJobResultParams,
  PostComparisonJobParams, PostComparisonJobParamsWithIds,
  DeleteComparisonJobParams
} from "./IComparisonJobClient.js";
import { isLargePayload, readChangedElementsPayload } from "./common.js";
import { callITwinApi, throwBadResponseCodeError } from "./iTwinApi.js";
import { isChangedElementsPayload, isComparisonJob } from "./typeGuards.js";

export interface ComparisonJobClientParams {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
}

export class ComparisonJobClient implements IComparisonJobClient {
  public readonly apiVersion = "v2" as const;
  private static readonly _acceptHeader = "application/vnd.bentley.itwin-platform.v2+json";
  private _baseUrl: string;
  private _getAccessToken: () => Promise<string>;

  constructor(args: ComparisonJobClientParams) {
    this._baseUrl = args.baseUrl;
    this._getAccessToken = args.getAccessToken;
  }

  /**
   * Deletes comparison job.
   * @returns void
   * @throws on a non 2XX response
  */
  public async deleteComparisonJob(args: DeleteComparisonJobParams): Promise<void> {
    await callITwinApi({
      url: `${this._baseUrl}/comparisonJob/${args.jobId}/iTwin/${args.iTwinId}/iModel/${args.iModelId}`,
      method: "DELETE",
      getAccessToken: this._getAccessToken,
      signal: args.signal,
      headers: {
        Accept: ComparisonJobClient._acceptHeader,
        ...args.headers,
      },
    });
  }

  /**
 * Gets comparison job.
 * @returns ComparisonJob
 * @throws on a non 2XX response.
*/
  public async getComparisonJob(args: GetComparisonJobParams): Promise<ComparisonJob> {
    return callITwinApi({
      url: `${this._baseUrl}/comparisonJob/${args.jobId}/iTwin/${args.iTwinId}/iModel/${args.iModelId}`,
      method: "GET",
      getAccessToken: this._getAccessToken,
      signal: args.signal,
      headers: {
        Accept: ComparisonJobClient._acceptHeader,
        ...args.headers,
      },
      validate: isComparisonJob,
    });
  }

  /**
   * Gets changed elements for given comparisonJob.
   *
   * If the full result blob is too large to load with property data, the job is re-read with
   * `Prefer: return=minimal` and the property-less minimal blob is loaded instead (flagged via
   * `changedElements.propertiesOmitted`). If no minimal blob is available, the full blob is parsed
   * with property data dropped.
   * @returns ChangedElements
   * @throws on a non 2XX response.
   */
  public async getComparisonJobResult(args: GetComparisonJobResultParams): Promise<ChangedElementsPayload> {
    const response = await this._fetchResult(args.comparisonJob.comparison.href, args.signal);
    if (!isLargePayload(response)) {
      return readChangedElementsPayload(response, isChangedElementsPayload);
    }

    const minimalHref = await this._getMinimalResultHref(args);
    if (minimalHref === undefined || minimalHref === args.comparisonJob.comparison.href) {
      return readChangedElementsPayload(response, isChangedElementsPayload, true);
    }

    void response.body?.cancel();
    const minimalResponse = await this._fetchResult(minimalHref, args.signal);
    return readChangedElementsPayload(minimalResponse, isChangedElementsPayload, true);
  }

  private async _fetchResult(href: string, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(href, {
      method: "GET",
      signal,
      headers: {
        Accept: ComparisonJobClient._acceptHeader,
      },
    });

    if (!response.ok) {
      await throwBadResponseCodeError(response, "Changed Elements request failed.");
    }

    return response;
  }

  /** Resolves the href of the minimal (property-less) result blob, or `undefined` if the service has none. */
  private async _getMinimalResultHref(args: GetComparisonJobResultParams): Promise<string | undefined> {
    try {
      const { comparisonJob } = await this.getComparisonJob({
        jobId: args.comparisonJob.jobId,
        iTwinId: args.comparisonJob.iTwinId,
        iModelId: args.comparisonJob.iModelId,
        signal: args.signal,
        headers: { ...args.headers, Prefer: "return=minimal" },
      });
      return comparisonJob.status === "Completed" ? comparisonJob.comparison.href : undefined;
    } catch {
      return undefined;
    }
  }

  /**
  * Gets comparison job.
  * @returns ComparisonJob
  * @throws on a non 2XX response.
  */
  public async postComparisonJob(args: PostComparisonJobParamsWithIds): Promise<ComparisonJob>;
  public async postComparisonJob(args: PostComparisonJobParams): Promise<ComparisonJob> {
    if (!args.startChangesetId || !args.endChangesetId) {
      throw new Error("ComparisonJobClient requires startChangesetId and endChangesetId.");
    }

    return callITwinApi({
      url: `${this._baseUrl}/comparisonJob`,
      method: "POST",
      getAccessToken: this._getAccessToken,
      signal: args.signal,
      headers: {
        Accept: ComparisonJobClient._acceptHeader,
        ...args.headers,
      },
      body: {
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetId: args.startChangesetId,
        endChangesetId: args.endChangesetId,
      },
      validate: isComparisonJob,
    });
  }
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  ChangedElementsPayload, IComparisonJobClient, ComparisonJob, GetComparisonJobParams, GetComparisonJobResultParams,
  PostComparisonJobParams, PostComparisonJobParamsWithIds,
  DeleteComparisonJobParams
} from "./IComparisonJobClient.js";
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
 * @returns ChangedElements
 * @throws on a non 2XX response.
 */
  public async getComparisonJobResult(args: GetComparisonJobResultParams): Promise<ChangedElementsPayload> {
    const response = await fetch(
      args.comparisonJob.comparison.href,
      {
        method: "GET",
        headers: {
          Accept: ComparisonJobClient._acceptHeader,
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

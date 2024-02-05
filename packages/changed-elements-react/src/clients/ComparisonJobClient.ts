/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  ChangedElements, IComparisonJobClient, ComparisonJob, GetComparisonJobParams, GetComparisonJobResultParams,
  PostComparisonJobParams,
  DeleteComparisonJobParams
} from "./IComparisonJobClient.js";
import { callITwinApi } from "./iTwinApi.js";
export interface ComparisonJobClientParams {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
}

export class ComparisonJobClient implements IComparisonJobClient {
  private static readonly _acceptHeader = "application/vnd.bentley.itwin-platform.v2+json";
  private _baseUrl: string;
  private _getAccessToken: () => Promise<string>;

  constructor(args: ComparisonJobClientParams) {
    this._baseUrl = args.baseUrl;
    this._getAccessToken = args.getAccessToken;
  }

  deleteComparisonJob(args: DeleteComparisonJobParams): Promise<void> {
    return callITwinApi({
      url: `${this._baseUrl}/comparisonJob/${args.jobId}/iTwin/${args.iTwinId}/iModel/${args.iModelId}`,
      method: "DELETE",
      getAccessToken: this._getAccessToken,
      signal: args.signal,
      headers: {
        Accept: ComparisonJobClient._acceptHeader,
        ...args.headers,
      },
    }) as unknown as Promise<void>;
  }

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
    }) as unknown as Promise<ComparisonJob>;
  }

  public async getComparisonJobResult(args: GetComparisonJobResultParams): Promise<ChangedElements> {
    return callITwinApi({
      url: args.comparisonJob.comparison.href,
      method: "GET",
      signal: args.signal,
      headers: {
        Accept: ComparisonJobClient._acceptHeader,
        ...args.headers,
      },
    }) as unknown as Promise<ChangedElements>;
  }

  public async postComparisonJob(args: PostComparisonJobParams): Promise<ComparisonJob> {
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
    }) as unknown as Promise<ComparisonJob>;
  }
}

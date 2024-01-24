/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type {
  ChangedElements, ComparisonJobClient, ComparisonJob, GetComparisonJobParams, GetComparisonJobResultParams,
  PostComparisonJobParams
} from "./ChangedElementsClient.js";
import { callITwinApi } from "./iTwinApi.js";
export interface ITwinChangedElementsClientParams {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
}

export class ITwinComparisonJobClient implements ComparisonJobClient {
  private acceptHeader = "application/vnd.bentley.itwin-platform.v2+json";
  private baseUrl: string;
  private getAccessToken: () => Promise<string>;

  constructor(args: ITwinChangedElementsClientParams) {
    this.baseUrl = args.baseUrl;
    this.getAccessToken = args.getAccessToken;
  }

  public async getComparisonJob(args: GetComparisonJobParams): Promise<ComparisonJob> {
    return callITwinApi({
      url: `${this.baseUrl}/comparisonJob/${args.jobId}/iTwin/${args.iTwinId}/iModel/${args.iModelId}`,
      method: "GET",
      getAccessToken: this.getAccessToken,
      signal: args.signal,
      headers: {
        Accept: this.acceptHeader,
        ...args.headers,
      },
      body: args.body,
    }) as unknown as Promise<ComparisonJob>;
  }

  public async getComparisonJobResult(args: GetComparisonJobResultParams): Promise<ChangedElements> {
    return callITwinApi({
      url: args.comparisonJob.comparison.href,
      method: "GET",
      signal: args.signal,
      headers: {
        Accept: this.acceptHeader,
        ...args.headers,
      },
      body: args.body,
    }) as unknown as Promise<ChangedElements>;
  }

  public async postComparisonJob(args: PostComparisonJobParams): Promise<ComparisonJob> {
    return callITwinApi({
      url: `${this.baseUrl}/comparisonJob`,
      method: "POST",
      getAccessToken: this.getAccessToken,
      signal: args.signal,
      headers: {
        Accept: this.acceptHeader,
        ...args.headers,
      },
      body: {
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetId: args.startChangesetId,
        endChangesetId: args.endChangesetId,
        ...args.body,
      },
    }) as unknown as Promise<ComparisonJob>;
  }
}

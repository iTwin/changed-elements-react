/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  ChangesetSelectDialog, ComparisonJobCompleted, VersionCompareContext, type ChangedElements,
  type ChangedElementsClient, type ChangesetInfo, type ComparisonJob, type GetComparisonJobParams,
  type PostComparisonJobParams
} from "@itwin/changed-elements-react";
import { type ReactElement } from "react";

import { changesets, currentNamedVersion, namedVersionList } from "./common";

export function ChangesetSelectDialogDemo(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    yield {
      changesets,
      namedVersions: [currentNamedVersion.namedVersion, ...namedVersionList.map(({ namedVersion }) => namedVersion)],
    };
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog iTwinId="" iModelId="" changesetId={changesets[0].id} getChangesetInfo={getChangesetInfo} />
    </VersionCompareContext>
  );
}

export function ChangesetSelectDialogLoading(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    yield await new Promise(() => { });
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog iTwinId="" iModelId="" changesetId="" getChangesetInfo={getChangesetInfo} />
    </VersionCompareContext>
  );
}

export function ChangesetSelectDialogNoChangesets(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    yield {
      changesets: [],
      namedVersions: [],
    };
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog iTwinId="" iModelId="" changesetId="" getChangesetInfo={getChangesetInfo} />
    </VersionCompareContext>
  );
}

class DemoChangedElementsClient implements ChangedElementsClient {
  constructor(private methods: Partial<ChangedElementsClient> = {}) { }

  public async getComparisonJob(args: GetComparisonJobParams): Promise<ComparisonJob> {
    return this.methods.getComparisonJob?.(args) ?? {
      comparisonJob: {
        status: "Queued",
        jobId: "",
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetId: "",
        endChangesetId: "",
      },
    };
  }

  public async getComparisonJobResult(comparisonJob: ComparisonJobCompleted): Promise<ChangedElements> {
    return this.methods.getComparisonJobResult?.(comparisonJob) ?? {
      changedElements: {
        elements: [],
        classIds: [],
        modelIds: [],
        parendIds: [],
        parentClassIds: [],
        opcodes: [],
        type: [],
        properties: [],
        oldChecksums: [],
        newChecksums: [],
      },
    };
  }

  public async postComparisonJob(args: PostComparisonJobParams): Promise<ComparisonJob> {
    return this.methods.postComparisonJob?.(args) ?? {
      comparisonJob: {
        status: "Queued",
        jobId: "",
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetId: "",
        endChangesetId: "",
      },
    };
  }
}

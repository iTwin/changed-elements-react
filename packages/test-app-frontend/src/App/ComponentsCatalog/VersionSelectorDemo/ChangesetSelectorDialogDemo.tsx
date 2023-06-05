/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  ChangesetSelectDialog, VersionCompareContext, type ChangedElements, type ChangedElementsClient, type ChangesetInfo,
  type ComparisonJob, type GetComparisonJobParams, type PostComparisonJobParams
} from "@itwin/changed-elements-react";
import { type ReactElement } from "react";

export function ChangesetSelectDialogDemo(): ReactElement {
  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog iTwinId="" iModelId="" changesetId="" getChangesetInfo={getChangesetInfo} />
    </VersionCompareContext>
  )
}

export function ChangesetSelectDialogLoading(): ReactElement {
  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog iTwinId="" iModelId="" changesetId="" getChangesetInfo={getChangesetInfo} />
    </VersionCompareContext>
  )
}

export function ChangesetSelectDialogNoChangesets(): ReactElement {
  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog iTwinId="" iModelId="" changesetId="" getChangesetInfo={getChangesetInfo} />
    </VersionCompareContext>
  );
}

async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
  yield {
    changesets: [],
    namedVersions: [],
  };
}

class DemoChangedElementsClient implements ChangedElementsClient {
  public async getComparisonJob(args: GetComparisonJobParams): Promise<ComparisonJob> {
    return {
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

  public async getComparisonJobResult(): Promise<ChangedElements> {
    return {
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
    return {
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

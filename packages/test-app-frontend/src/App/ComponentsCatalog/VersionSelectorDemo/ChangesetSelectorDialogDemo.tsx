/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  ChangesetSelectDialog, ComparisonJobCompleted, VersionCompareContext, type ChangedElements,
  type ChangedElementsClient, type ChangesetInfo, type ComparisonJob, type GetComparisonJobParams,
  type PostComparisonJobParams,
  Changeset
} from "@itwin/changed-elements-react";
import { type ReactElement } from "react";

import { changesets, currentNamedVersion, namedVersionList } from "./common";

export function ChangesetSelectDialogDemo(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    yield {
      changesets: changesets.slice(0, 2),
      namedVersions: [currentNamedVersion.namedVersion, ...namedVersionList.map(({ namedVersion }) => namedVersion)],
    };
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      changesets: changesets.slice(2),
    };
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog
        iTwinId=""
        iModelId=""
        currentChangesetId={changesets[0]}
        getChangesetInfo={getChangesetInfo}
      />
    </VersionCompareContext>
  );
}

export function ChangesetSelectDialogLoading(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    yield await new Promise(() => { });
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog
        iTwinId=""
        iModelId=""
        currentChangesetId={changesets[0]}
        getChangesetInfo={getChangesetInfo}
      />
    </VersionCompareContext>
  );
}

export function ChangesetSelectDialogNoChangesets(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    return {
      changesets: [],
      namedVersions: [],
    };
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog
        iTwinId=""
        iModelId=""
        currentChangesetId={changesets[0]}
        getChangesetInfo={getChangesetInfo}
      />
    </VersionCompareContext>
  );
}

export function ChangesetSelectDialogError(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    yield {
      changesets: changesets.slice(0, 2),
      namedVersions: [currentNamedVersion.namedVersion, ...namedVersionList.map(({ namedVersion }) => namedVersion)],
    };
    throw new Error();
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog
        iTwinId=""
        iModelId=""
        currentChangesetId={changesets[0]}
        getChangesetInfo={getChangesetInfo}
      />
    </VersionCompareContext>
  );
}

export function ChangesetSelectDialogManyChangesets(): ReactElement {
  async function* getChangesetInfo(): AsyncIterable<ChangesetInfo> {
    const numChangesets = 20_000;
    const batchSize = 1000;
    const changesetTemplate: Changeset = {
      id: "",
      date: new Date(),
      description: "",
      isProcessed: true,
    };

    for (let i = 0; i < numChangesets; i += batchSize) {
      yield {
        changesets: Array
          .from({ length: batchSize })
          .map((_, batchIndex) => ({
            ...changesetTemplate,
            id: (i + batchIndex).toString(),
            description: `Changeset ${numChangesets - i - batchIndex}`
          })),
      };
    }
  }

  return (
    <VersionCompareContext changedElementsClient={new DemoChangedElementsClient()}>
      <ChangesetSelectDialog
        iTwinId=""
        iModelId=""
        currentChangesetId={changesets[0]}
        getChangesetInfo={getChangesetInfo}
      />
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

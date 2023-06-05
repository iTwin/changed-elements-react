/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Button, ProgressRadial, Text } from "@itwin/itwinui-react";
import { ReactElement, useEffect, useState } from "react";

import { useVersionCompare } from "../VersionCompareContext.js";
import { ChangedElements, ChangedElementsClient, ComparisonJob } from "../client/ChangedElementsClient.js";
import { ChangesetList } from "./ChangesetList.js";
import { Changeset } from "./NamedVersionSelector.js";
import { ChangesetInfo, UseVersionSelectorResult, useVersionSelector } from "./useVersionSelector.js";

export interface ChangesetSelectDialogProps {
  iTwinId: string;
  iModelId: string;
  changesetId: string;
  getChangesetInfo: () => AsyncIterable<ChangesetInfo>;
  onStartComparison?: (currentChangesetId: string, targetChangesetId: string, changedElements: ChangedElements) => void;
}

export function ChangesetSelectDialog(props: ChangesetSelectDialogProps): ReactElement {
  const data = useVersionSelector(props.getChangesetInfo);
  const currentChangeset = data.status === "ready" ? data.changesets.find(({ id }) => id === props.changesetId) : undefined;
  const [baseVersion, setBaseVersion] = useState<string>();
  const [selectedChangesetId, setSelectedChangeset] = useState<string>();

  return (
    <div style={{ display: "grid", grid: "auto minmax(0, 1fr) auto / 1fr", gap: "var(--iui-size-s)" }}>
      {
        !baseVersion &&
        <>
          <Text variant="subheading">Select version for comparison</Text>
          <VersionPicker
            iModelId={props.iModelId}
            changesetId={props.changesetId}
            data={data}
            selectedChangesetId={selectedChangesetId}
            onChangesetSelected={setSelectedChangeset}
          />
        </>
      }
      {
        baseVersion && currentChangeset &&
        <>
          <Text variant="subheading">Preparing comparison</Text>
          <ComparisonLoader
            iTwinId={props.iTwinId}
            iModelId={props.iModelId}
            currentChangeset={currentChangeset}
            baseChangesetId={baseVersion}
            data={data}
            onStartComparison={props.onStartComparison}
          />
        </>
      }
      <div style={{ display: "flex", justifyContent: "end", gap: "var(--iui-size-xs)" }}>
        <Button
          styleType="high-visibility"
          disabled={!selectedChangesetId}
          onClick={() => setBaseVersion(selectedChangesetId)}>
          Start comparison
        </Button>
        <Button onClick={() => setBaseVersion(undefined)}>Cancel</Button>
      </div>
    </div>
  );
}

interface VersionPickerProps {
  iModelId: string;
  changesetId: string;
  data: UseVersionSelectorResult;
  selectedChangesetId: string | undefined;
  onChangesetSelected: (changesetId: string) => void;
}

function VersionPicker(props: VersionPickerProps): ReactElement {
  if (props.data.status !== "ready") {
    return (
      <>
        <ProgressRadial size="large" indeterminate />
        <Text variant="leading">Loading changesets...</Text>
      </>
    );
  }

  return (
    <div style={{ overflow: "auto" }}>
      <ChangesetList
        currentChangesetId={props.changesetId}
        changesets={props.data.changesets}
        namedVersions={props.data.namedVersions}
        selectedChangesetId={props.selectedChangesetId}
        onChangesetSelected={props.onChangesetSelected}
        actionable
      />
    </div>
  );
}

interface ComparisonLoaderProps {
  iTwinId: string;
  iModelId: string;
  currentChangeset: Changeset;
  baseChangesetId: string;
  data: UseVersionSelectorResult;
  onStartComparison?: (currentChangesetId: string, targetChangesetId: string, changedElements: ChangedElements) => void;
}

function ComparisonLoader(props: ComparisonLoaderProps): ReactElement {
  const { changedElementsClient } = useVersionCompare();

  useEffect(
    () => {
      let disposed = false;
      void (async () => {
        const { comparisonJob } = await postOrGetComparisonJob({
          changedElementsClient,
          iTwinId: props.iTwinId,
          iModelId: props.iModelId,
          startChangesetId: props.data.changesets[props.data.changesets.findIndex(({ id }) => id === props.baseChangesetId) - 1].id,
          endChangesetId: props.currentChangeset.id,
        });
        if (disposed) {
          return;
        }

        if (comparisonJob.status === "Completed") {
          const changedElements = await changedElementsClient.getComparisonJobResult({ comparisonJob });
          if (!disposed) {
            props.onStartComparison?.(props.currentChangeset.id, props.baseChangesetId, changedElements);
          }
        }
      })();

      return () => { disposed = true; };
    },
    [props.iTwinId, props.iModelId],
  );

  return (
    <div style={{ display: "grid" }}>
      <Text>
        Comparing {props.currentChangeset?.description} with {props.data.changesets.find(({ id }) => id === props.baseChangesetId)?.description}
      </Text>
      <ProgressRadial style={{ placeSelf: "center" }} size="large" indeterminate />
      <ChangesetList
        changesets={props.data.changesets.slice(0, props.data.changesets.findIndex(({ id }) => id === props.baseChangesetId))}
        namedVersions={props.data.namedVersions}
      />
    </div>
  );
}

interface PostOrGetComparisonJobParams {
  changedElementsClient: ChangedElementsClient;
  iTwinId: string;
  iModelId: string;
  startChangesetId: string;
  endChangesetId: string;
}

async function postOrGetComparisonJob(args: PostOrGetComparisonJobParams): Promise<ComparisonJob> {
  let result: ComparisonJob;
  try {
    result = await args.changedElementsClient.postComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      startChangesetId: args.startChangesetId,
      endChangesetId: args.endChangesetId,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ComparisonExists") {
      throw error;
    }

    result = await args.changedElementsClient.getComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      jobId: `${args.startChangesetId}-${args.endChangesetId}`,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  return result;
}

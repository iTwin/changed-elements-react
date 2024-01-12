/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Button, ProgressRadial, Text } from "@itwin/itwinui-react";
import { ReactElement, useEffect, useRef, useState } from "react";

import { useVersionCompare } from "../VersionCompareContext.js";
import { ChangedElements, ChangedElementsClient, ComparisonJob } from "../client/ChangedElementsClient.js";
import { ChangesetList } from "./ChangesetList.js";
import { Changeset } from "./NamedVersionSelector.js";
import { ChangesetInfo, UseVersionSelectorResult, useVersionSelector } from "./useVersionSelector.js";

import "./ChangesetSelectDialog.css";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@itwin/core-frontend";

export interface ChangesetSelectDialogProps {
  iTwinId: string;
  iModelId: string;
  currentChangesetId: string;
  getChangesetInfo: () => AsyncIterable<ChangesetInfo>;
  onStartComparison?: (currentChangesetId: string, targetChangesetId: string, changedElements: ChangedElements) => void;
}

export function ChangesetSelectDialog(props: ChangesetSelectDialogProps): ReactElement {
  const data = useVersionSelector(props.getChangesetInfo);
  const [baseVersion, setBaseVersion] = useState<string>();
  const [selectedChangesetId, setSelectedChangeset] = useState<string>();
  const [error, setError] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const renderComparisonLoader = () => {
    try {
      return (
        <>
          <Text variant="subheading">Preparing comparison</Text>
          <ComparisonLoader
            iTwinId={props.iTwinId}
            iModelId={props.iModelId}
            currentChangesetId={props.currentChangesetId}
            baseChangesetId={baseVersion as string}
            data={data}
            onStartComparison={props.onStartComparison}
          />
        </>
      );
    } catch (error) {
      setError(true);
      setBaseVersion(undefined);
    }
  }
  useEffect(
    () => {
      const element = progressRef.current;
      const loadMore = data.status === "ready" && data.loadMore;
      if (!element || !contentRef.current || !loadMore) {
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[entries.length - 1].isIntersecting) {
            loadMore();
          }
        },
        { root: contentRef.current, rootMargin: "200px" },
      );

      observer.observe(element);
      return () => observer.unobserve(element);
    },
    [data],
  );

  return (
    <div className="iTwinChangedElements__changeset-select-dialog">
      {error ? <Text variant="subheading" style={{color:"red"}}> An error occurred with the selected comparison please try again.</Text> : <Text variant="subheading">Select Version To Compare With Current.</Text>}
      <div ref={contentRef} style={{ gridArea: "content", overflow: "auto" }}>
        {!baseVersion ?
          <>
            {
              <>
                {
                  (data.changesets.length > 0 || (data.status === "ready" && !data.loadMore)) &&
                  <VersionPicker
                    iModelId={props.iModelId}
                    changesetId={props.currentChangesetId}
                    data={data}
                    selectedChangesetId={selectedChangesetId}
                    onChangesetSelected={setSelectedChangeset}
                  />
                }
              </>
            }
            {
              (data.status !== "ready" || data.loadMore !== undefined) &&
              <div ref={progressRef}>
                <ProgressRadial size="large" indeterminate />
                <Text variant="leading">Loading changesets...</Text>
              </div>
            }
          </>
          :
          renderComparisonLoader()
        }
      </div>
      <div style={{ gridArea: "buttons", display: "flex", justifyContent: "end", gap: "var(--iui-size-xs)", position:"relative", bottom:"0" }}>
        <Button
          styleType="high-visibility"
          disabled={!selectedChangesetId}
          onClick={() => {
            setBaseVersion(selectedChangesetId);
            setError(false);
          }}>
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
  return (
    <ChangesetList
      currentChangesetId={props.changesetId}
      changesets={props.data.changesets}
      namedVersions={props.data.namedVersions}
      selectedChangesetId={props.selectedChangesetId}
      onChangesetSelected={props.onChangesetSelected}
      actionable
      onlyNamedVersions={true}
    />
  );
}

interface ComparisonLoaderProps {
  iTwinId: string;
  iModelId: string;
  currentChangesetId: string;
  baseChangesetId: string;
  data: UseVersionSelectorResult;
  onStartComparison?: (currentChangesetId: string, targetChangesetId: string, changedElements: ChangedElements) => void;
}

function ComparisonLoader(props: ComparisonLoaderProps): ReactElement {
  const { changedElementsClient } = useVersionCompare();
  useEffect(
    () => {
      let disposed = false;
      void (
        async () => {
            let { comparisonJob } = await postOrGetComparisonJob({
              changedElementsClient,
              iTwinId: props.iTwinId,
              iModelId: props.iModelId,
              startChangesetId: props.data.changesets[props.data.changesets.findIndex(
                ({ id }) => id === props.baseChangesetId,
              ) - 1].id,
              endChangesetId: props.currentChangesetId,
            });
            if (disposed) {
              return;
            }
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(
              OutputMessagePriority.Warning,
              "Comparison Processing",
              `Comparing ${props.data.changesets.find(({ id }) => id === props.currentChangesetId)?.description ?? "current changeset"} with ${props.data.changesets.find(({ id }) => id === props.baseChangesetId)?.description}.`,
              OutputMessageType.Sticky,
            ),
          );
            while (comparisonJob.status === "Queued" || comparisonJob.status === "Started") {
              await new Promise((resolve) => setTimeout(resolve, 5000));
              ({ comparisonJob } = await changedElementsClient.getComparisonJob({
                iModelId: props.iModelId,
                iTwinId: props.iTwinId,
                jobId: comparisonJob.jobId,
                headers: { "Content-Type": "application/json" },
              }));
            }

          if (comparisonJob.status === "Completed") {
            const changedElements = await changedElementsClient.getComparisonJobResult({ comparisonJob });
              if (!disposed) {
                (0, props.onStartComparison)?.(props.currentChangesetId, props.baseChangesetId, changedElements);
              }
            }
        })();

      return () => { disposed = true; };
    },
    [props.iTwinId, props.iModelId, props.data, changedElementsClient, props.baseChangesetId, props.currentChangesetId, props.onStartComparison],
  );

  return (
    <div style={{ display: "grid" }}>
      <Text>
        You may close widget while comparison is being prepared.
      </Text>
      <ProgressRadial style={{ placeSelf: "center" }} size="large" indeterminate />
      <ChangesetList
        changesets={props.data.changesets.slice(0, props.data.changesets.findIndex(({ id }) => id === props.baseChangesetId))}
        namedVersions={props.data.namedVersions}
        onlyNamedVersions={false}
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
      headers: { "Content-Type": "application/json" },
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

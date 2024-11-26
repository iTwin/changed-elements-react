/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { LoadingSpinner } from "@itwin/core-react";
import { Badge, ProgressLinear, ProgressRadial, Radio, Text } from "@itwin/itwinui-react";
import { useState, type ReactElement, type ReactNode } from "react";

import type { ChangesetChunk } from "../../api/ChangedElementsApiClient";
import type { NamedVersion } from "../../clients/iModelsClient";
import {
  VersionProcessedState, type CurrentNamedVersionAndNamedVersions, type JobProgress,
  type JobStatus, type VersionState,
} from "./NamedVersions";

/** Options for VersionCompareSelectComponent. */
interface VersionCompareSelectorProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /** Optional handler for when a version is selected. */
  onVersionSelected: (
    currentVersion: NamedVersion,
    targetVersion: NamedVersion,
    chunks?: ChangesetChunk[],
  ) => void;

  /** Whether to show a title for the component or not. */
  wantTitle?: boolean;

  /** Named Versions to be displayed */
  namedVersions: CurrentNamedVersionAndNamedVersions | undefined;

  /** Optional prop for a user supplied component to handle managing named versions. */
  manageNamedVersionsSlot?: ReactNode | undefined;

  /** If true display loading spinner to indicate we are receiving more named versions. */
  isLoading: boolean;
}

/** Component that lets the user select which named version to compare to. */
export function VersionCompareSelectComponent(props: VersionCompareSelectorProps) {
  const [targetVersion, setTargetVersion] = useState<NamedVersion>();

  const handleVersionClicked = (targetVersion: NamedVersion) => {
    setTargetVersion(targetVersion);
    if (props.namedVersions && props.namedVersions.currentVersion) {
      props.onVersionSelected?.(props.namedVersions.currentVersion, targetVersion);
    }
  };

  if (!props.namedVersions) {
    return (
      <div className="vc-spinner">
        <ProgressRadial size="large" indeterminate />
      </div>
    );
  }

  return (
    <VersionCompareSelectorInner
      entries={props.namedVersions.entries}
      versionState={props.namedVersions.versionState}
      currentVersion={props.namedVersions.currentVersion}
      selectedVersionChangesetId={targetVersion?.changesetId ?? undefined}
      onVersionClicked={handleVersionClicked}
      wantTitle={props.wantTitle}
      manageNamedVersionsSlot={props.manageNamedVersionsSlot}
      isLoading={props.isLoading}
    />
  );
}

interface VersionCompareSelectorInnerProps {
  entries: NamedVersion[];
  versionState: VersionState[];
  currentVersion: NamedVersion | undefined;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;
  wantTitle: boolean | undefined;

  /** Optional prop for a user supplied component to handle managing named versions. */
  manageNamedVersionsSlot?: ReactNode | undefined;

  /** If true display loading spinner to indicate we are receiving more named versions. */
  isLoading: boolean;
}

/** Component that houses named version list. Also displays the current versions information. */
function VersionCompareSelectorInner(props: VersionCompareSelectorInnerProps): ReactElement {
  return (
    <div className="comparison-job-selector">
      {
        props.currentVersion &&
        <div className="comparison-job-row">
          <div className="current-comparison-title">
            {`${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}:`}
          </div>
          <div className="comparison-job-container-current">
            <CurrentVersionEntry namedVersion={props.currentVersion} isProcessed />
          </div>
        </div>
      }
      {
        props.wantTitle &&
        <div className="title">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompare")}
        </div>
      }
      {<div className="comparison-job-label">
        {`${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.withPrevious")}:`}
      </div>}
      {
        props.entries.length > 0 && props.currentVersion ? (
          <VersionList
            entries={props.entries}
            versionState={props.versionState}
            currentVersion={props.currentVersion}
            selectedVersionChangesetId={props.selectedVersionChangesetId}
            onVersionClicked={props.onVersionClicked}
            isLoading={props.isLoading}
          />
        ) : (
          <Text className="no-named-versions-message" variant="leading">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noPastNamedVersions")}
          </Text>
        )
      }
      {
        props.manageNamedVersionsSlot &&
        <ManageNamedVersions>
          {props.manageNamedVersionsSlot}
        </ManageNamedVersions>
      }
    </div>
  );
}

interface VersionListProps {
  entries: NamedVersion[];

  versionState: VersionState[];

  currentVersion: NamedVersion;

  selectedVersionChangesetId: string | undefined;

  onVersionClicked: (targetVersion: NamedVersion) => void;

  /** If true display loading spinner to indicate we are receiving more named versions. */
  isLoading: boolean;
}

/** Component that displays named versions (non current). */
function VersionList(props: VersionListProps): ReactElement {
  return (
    <div className="comparison-job-row comparison-job-list">
      <div className="comparison-job-container-table">
        <div className="comparison-job-container-header">
          <div className="comparison-job-header">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versions")}
          </div>
          <div className="status-header">
            Comparison Status
          </div>
        </div>
        <div className="comparison-job-container">
          {
            props.entries.map((entry, i) => (
              <VersionListEntry
                key={entry.changesetId}
                namedVersion={entry}
                versionState={props.versionState[i]}
                isSelected={
                  props.selectedVersionChangesetId !== undefined &&
                  entry.changesetId === props.selectedVersionChangesetId
                }
                onClicked={props.onVersionClicked}
              />
            ))
          }
          {props.isLoading && <LoadingSpinner className="vc-spinner-entry-list" />}
        </div>
      </div>
    </div>
  );
}

interface ManageNamedVersionsProps {
  children: ReactNode;
}

/** Provides a div that should be populated by child component. */
function ManageNamedVersions(props: ManageNamedVersionsProps): ReactElement {
  return (
    <div className="comparison-job-selector-manage-link">
      {props.children}
    </div>
  );
}

interface CurrentVersionEntryProps {
  namedVersion: NamedVersion;
  isProcessed: boolean;
}

/** Component for current version. Displays the current version's name date description. */
function CurrentVersionEntry(props: CurrentVersionEntryProps): ReactElement {
  return (
    <div className="vc-entry-current" key={props.namedVersion.changesetId}>
      <VersionNameAndDescription version={props.namedVersion} isProcessed={props.isProcessed} />
      <DateCurrentAndJobInfo createdDate={props.namedVersion.createdDateTime} jobStatus={"Unknown"}>
        <div className="entry-info">
          {
            props.namedVersion.createdDateTime &&
            new Date(props.namedVersion.createdDateTime).toDateString()
          }
        </div>
        <div className="entry-info">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.current")}
        </div>
      </DateCurrentAndJobInfo>
    </div>
  );
}

interface VersionListEntryProps {
  namedVersion: NamedVersion;
  versionState: VersionState;
  isSelected: boolean;
  onClicked: (targetVersion: NamedVersion) => void;
}

/**
 * Named Version List Entry. Displays the job information. The job will be between
 * this version and the current version. Displays the description and name of the
 * version as well.
 */
function VersionListEntry(props: VersionListEntryProps): ReactElement {
  const isProcessed = props.versionState.state === VersionProcessedState.Processed ||
    (props.versionState.jobStatus !== "Processing" && props.versionState.jobStatus !== "Queued");

  const handleClick = async () => {
    if (
      props.versionState.state !== VersionProcessedState.Processed ||
      props.versionState.jobStatus === "Processing" ||
      props.versionState.jobStatus === "Queued"
    ) {
      return;
    }

    props.onClicked(props.namedVersion);
  };

  const versionStateMap = {
    [VersionProcessedState.Verifying]: {
      className: "state-unavailable",
      message: "VersionCompare:versionCompare.unavailable",
    },
    [VersionProcessedState.Processed]: {
      className: "current-empty",
      message: "",
    },
    [VersionProcessedState.Processing]: {
      className: "state-processing",
      message: "VersionCompare:versionCompare.processed",
    },
    [VersionProcessedState.Unavailable]: {
      className: "state-unavailable",
      message: "VersionCompare:versionCompare.unavailable",
    },
  };

  const { className, message } = versionStateMap[
    props.versionState.state ?? VersionProcessedState.Unavailable
  ];

  return (
    <div
      className={
        isProcessed
          ? props.isSelected ? "vc-entry selected" : "vc-entry"
          : "vc-entry unprocessed"
      }
      onClick={handleClick}
    >
      <div className="vcs-checkbox">
        <Radio
          disabled={!isProcessed}
          checked={props.isSelected}
          onChange={() => { /* no-op: avoid complaints for missing onChange */ }}
        />
      </div>
      <VersionNameAndDescription version={props.namedVersion} isProcessed={isProcessed} />
      {
        props.versionState.state === VersionProcessedState.Verifying
          ? (
            <>
              <DateCurrentAndJobInfo
                createdDate={props.namedVersion.createdDateTime}
                jobStatus={props.versionState.jobStatus}
                jobProgress={props.versionState.jobProgress}
              >
                {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.verifying")}
              </DateCurrentAndJobInfo>
              <ProgressLinear indeterminate />
            </>
          ) : (
            <DateCurrentAndJobInfo
              createdDate={props.namedVersion.createdDateTime}
              jobStatus={props.versionState.jobStatus ?? "Unknown"}
              jobProgress={props.versionState.jobProgress}
            >
              <div className="state-div">
                <div className={className}>{message}</div>
              </div>
            </DateCurrentAndJobInfo>
          )
      }
    </div>
  );
}

interface VersionNameAndDescriptionProps {
  version: NamedVersion;
  isProcessed: boolean;
}

function VersionNameAndDescription(props: VersionNameAndDescriptionProps): ReactElement {
  return (
    <div className="name-and-description">
      <div className={props.isProcessed ? "name" : "name-unprocessed"}>
        {props.version.displayName}
      </div>
      <div className={props.isProcessed ? "description" : "description-unprocessed"}>
        {
          props.version.description ||
          IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noDescription")
        }
      </div>
    </div>
  );
}

interface DateAndCurrentProps {
  createdDate?: string;
  children: ReactNode;
  jobStatus?: JobStatus;
  jobProgress?: JobProgress;
}

function DateCurrentAndJobInfo(props: DateAndCurrentProps): ReactElement {
  const colorMap = {
    red: "#efa9a9",
    green: "#c3e1af",
    teal: "#b7e0f2",
  };

  const jobStatusMap = {
    "Available": {
      backgroundColor: colorMap.green,
      text: "VersionCompare:versionCompare.available",
    },
    "Queued": {
      backgroundColor: colorMap.teal,
      text: "VersionCompare:versionCompare.queued",
    },
    "Processing": {
      backgroundColor: colorMap.teal,
      text: "VersionCompare:versionCompare.processing",
    },
    "Not Processed": {
      backgroundColor: "",
      text: "VersionCompare:versionCompare.notProcessed",
    },
    "Error": {
      backgroundColor: colorMap.red,
      text: "VersionCompare:versionCompare.error",
    },
    "Unknown": {
      backgroundColor: "",
      text: "VersionCompare:versionCompare.notProcessed",
    },
  };

  const { backgroundColor, text } = jobStatusMap[props.jobStatus ?? "Unknown"];
  const progress = props.jobProgress && Math.floor(
    100 * props.jobProgress.currentProgress / props.jobProgress.maxProgress,
  );
  return (
    <div className="date-and-current">
      {props.children}
      {
        props.jobStatus && props.jobStatus !== "Unknown" &&
        <Badge backgroundColor={backgroundColor}>
          {IModelApp.localization.getLocalizedString(text)}
        </Badge>
      }
      {
        props.jobProgress && props.jobProgress.maxProgress > 0 &&
        <Text>
          {`${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.progress")}: ${progress}`}%
        </Text>
      }
    </div>
  );
}

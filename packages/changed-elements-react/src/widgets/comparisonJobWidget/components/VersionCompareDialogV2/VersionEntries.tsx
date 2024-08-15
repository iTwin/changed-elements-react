/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ReactElement, ReactNode } from "react";
import { ProgressLinear, Radio, Badge, Text } from "@itwin/itwinui-react";
import { IModelApp } from "@itwin/core-frontend";
import { JobStatus, JobProgress } from "./models/ComparisonJobModels";
import { VersionProcessedState } from "./models/VersionProcessedState";
import { NamedVersion } from "../../../../clients/iModelsClient";
import { VersionState } from "./models/VersionState";
import "./styles/ComparisonJobWidget.scss";

interface CurrentVersionEntryProps {
  versionState: VersionState;
}

/**
 * Component for current version.
 * Displays the current version's name date description.
 */
export function CurrentVersionEntry(props: CurrentVersionEntryProps): ReactElement {
  const isProcessed = props.versionState.state === VersionProcessedState.Processed;
  return (
    <div className="vc-entry-current" key={props.versionState.version.changesetId}>
      <VersionNameAndDescription version={props.versionState.version} isProcessed={isProcessed} />
      <DateCurrentAndJobInfo createdDate={props.versionState.version.createdDateTime} jobStatus={"Unknown"}>
        <div className="entry-info">
          {props.versionState.version.createdDateTime ? new Date(props.versionState.version.createdDateTime).toDateString() : ""}
        </div>
        <div className="entry-info">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.current")}
        </div>
      </DateCurrentAndJobInfo>
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
  const jobBadgeBackground = getJobBackgroundColor(props.jobStatus ?? "Unknown");

  return (
    <div className="date-and-current">
      {props.children}
      {props.jobStatus === undefined || props.jobStatus === "Unknown" ? <></> :
        <Badge backgroundColor={jobBadgeBackground}>{`${getLocalizedJobStatusText(props.jobStatus)}`}</Badge>}
      {props.jobProgress === undefined || props.jobProgress.maxProgress === 0 ? <></>
        : <Text>
          {`${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.progress")}: ${Math.floor((props.jobProgress.currentProgress / props.jobProgress.maxProgress) * 100)}%`}
        </Text>}
    </div>
  );
}

const getJobBackgroundColor = (jobStatus: JobStatus): string => {
  const green = "#c3e1af";
  const teal = "#b7e0f2";
  const red = "#efa9a9";
  switch (jobStatus) {
    case "Available":
      return green;
    case "Queued":
      return teal;
    case "Processing":
      return teal;
    case "Not Processed":
      return "";
    case "Error":
      return red;
    default:
      return "";
  }
};

const getLocalizedJobStatusText = (jobStatus: JobStatus): string => {
  switch (jobStatus) {
    case "Available":
      return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.available");
    case "Queued":
      return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.queued");
    case "Processing":
      return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.processing");
    case "Not Processed":
      return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.notProcessed");
    case "Error":
      return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.error");
    default:
      return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.notProcessed");
  }
};

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
        {props.version.description === ""
          ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noDescription")
          : props.version.description}
      </div>
    </div>
  );
}

interface VersionListEntryProps {
  versionState: VersionState;
  isSelected: boolean;
  onClicked: (targetVersion: NamedVersion) => void;
}

/**
 * Named Version List Entry.
 * Displays the job information. The job will be between this version and the current version.
 * Displays the description and name of the version as well.
 */
export function VersionListEntry(props: VersionListEntryProps): ReactElement {
  const handleClick = async () => {
    if (props.versionState.state !== VersionProcessedState.Processed || props.versionState.jobStatus === "Processing" || props.versionState.jobStatus === "Queued") {
      return;
    }

    props.onClicked(props.versionState.version);
  };

  const getStateDivClassname = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Processed:
        return "current-empty";
      case VersionProcessedState.Processing:
        return "state-processing";
      case VersionProcessedState.Unavailable:
      default:
        return "state-unavailable";
    }
  };
  const getStateDivMessage = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Processed:
        return "";
      case VersionProcessedState.Processing: {
        return IModelApp.localization.getLocalizedString(
          "VersionCompare:versionCompare.processed",
        );
      }
      case VersionProcessedState.Unavailable:
      default:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.unavailable");
    }
  };
  const getAvailableDate = () => {
    return (
      <DateCurrentAndJobInfo createdDate={props.versionState.version.createdDateTime}
        jobStatus={props.versionState.jobStatus}
        jobProgress={props.versionState.jobProgress}>
        <div className="state-div">
          <div className={getStateDivClassname()}>{getStateDivMessage()}</div>
        </div>
      </DateCurrentAndJobInfo>
    );
  };

  const isProcessed = props.versionState.state === VersionProcessedState.Processed || (props.versionState.jobStatus !== "Processing" && props.versionState.jobStatus !== "Queued");
  return (
    <div
      className={
        isProcessed
          ? props.isSelected
            ? "vc-entry selected"
            : "vc-entry"
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
      <VersionNameAndDescription version={props.versionState.version} isProcessed={isProcessed} />
      {
        props.versionState.state === VersionProcessedState.Verifying
          ? <>
            <DateCurrentAndJobInfo createdDate={props.versionState.version.createdDateTime}
              jobStatus={props.versionState.jobStatus}
              jobProgress={props.versionState.jobProgress}
            >
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.verifying")}
            </DateCurrentAndJobInfo>
            <ProgressLinear indeterminate />
          </>
          : getAvailableDate()
      }
    </div>
  );
}

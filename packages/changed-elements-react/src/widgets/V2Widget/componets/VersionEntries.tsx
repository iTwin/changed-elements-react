import { ReactElement, ReactNode, useEffect, useState } from "react";
import { ProgressLinear, Radio, Badge, Text } from "@itwin/itwinui-react";
import { useInView } from 'react-intersection-observer';
import { IModelApp } from "@itwin/core-frontend";
import { JobStatus, JobStatusAndJobProgress, JobProgress } from '../models/JobStatus';
import { VersionProcessedState } from "../VersionProcessedState";
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionState } from "../models/VersionState";
import "./styles/VersionCompareSelectWidget.scss";


interface CurrentVersionEntryProps {
  versionState: VersionState;
}

/**
 * Component for current version.
 */
export function CurrentVersionEntry(props: CurrentVersionEntryProps): ReactElement {
  const isProcessed = props.versionState.state === VersionProcessedState.Processed;
  return (
    <div className="vc-entry-current" key={props.versionState.version.changesetId}>
      <VersionNameAndDescription version={props.versionState.version} isProcessed={isProcessed} />
      <DateCurrentAndJobInfo createdDate={props.versionState.version.createdDateTime} jobStatus={"Unknown"}>
        <div className="date">
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
  let jobBadgeBackground;
  switch (props.jobStatus) {
    case "Available":
      jobBadgeBackground = "celery";
      break;
    case "Queued":
      jobBadgeBackground = "sunglow";
      break;
    case "Processing":
      jobBadgeBackground = "poloblue";
      break;
    case "Not Processed":
      jobBadgeBackground = "ash";
      break;
    case "Error":
      jobBadgeBackground = "froly";
      break;
    default:
      jobBadgeBackground = "ash";
      break;
  }
  return (
    <div className="date-and-current">
      {props.children}
      {props.jobStatus === undefined || props.jobStatus === "Unknown" ? <></> : <Badge backgroundColor={jobBadgeBackground}>{`${props.jobStatus}`}</Badge>}
      {props.jobProgress === undefined || props.jobProgress.totalToComplete === 0 ? <></> : <Text>{`Progress: ${props.jobProgress.numberCompleted}/${props.jobProgress.totalToComplete}`}</Text>}
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
 */
export function VersionListEntry(props: VersionListEntryProps): ReactElement {
  const handleClick = async () => {
    if (props.versionState.state !== VersionProcessedState.Processed) {
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

  const isProcessed = props.versionState.state === VersionProcessedState.Processed;
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
          disabled={!isProcessed || props.versionState.jobStatus==="Processing" || props.versionState.jobStatus==="Queued"}
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

import { ReactElement, ReactNode } from "react";
import { ProgressLinear, ProgressRadial, Radio, Text } from "@itwin/itwinui-react";
import { IModelApp } from "@itwin/core-frontend";
import { jobStatus } from "../models/JobStatus";
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
      <DateCurrentAndJobStatus createdDate={props.versionState.version.createdDateTime} jobStatus={props.versionState.jobStatus}>
        <div className="job-status-not-started">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.current")}
        </div>
      </DateCurrentAndJobStatus>
    </div>
  );
}

interface DateAndCurrentProps {
  createdDate?: string;
  children: ReactNode;
  jobStatus?: jobStatus;
}

function DateCurrentAndJobStatus(props: DateAndCurrentProps): ReactElement {
  let jobStatusClass;
  switch (props.jobStatus) {
    case "Ready":
      jobStatusClass = "job-status-complete";
      break;
    case "In Progress":
      jobStatusClass = "job-status-progress";
      break;
    case "Not Started":
      jobStatusClass = "job-status-not-started";
      break;
    default:
      jobStatusClass = "";
      break;
  }
  return (
    <div className="date-and-current">
      <div className="date">
        {props.createdDate ? new Date(props.createdDate).toDateString() : ""}
      </div>
      {props.children}
      <Text className={jobStatusClass}>{props.jobStatus == undefined || props.jobStatus === "Unknown" ? "" : `${props.jobStatus}`}</Text>
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
  previousEntry: VersionState;
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
  const getStateSecondRow = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Processing: {
        // const processedStateMsg =
        //   (props.versionState.numberNeededChangesets === 0
        //     ? 0
        //     : Math.floor(
        //       (props.versionState.numberProcessedChangesets / props.versionState.numberNeededChangesets) * 100,
        //     )) + "%";
        return <div className="state-second-row">{100}</div>;
      }
      case VersionProcessedState.Unavailable:
        return <span className="state-second-row-warning icon icon-status-warning" />;
      case VersionProcessedState.Processed:
      default:
        return undefined;
    }
  };
  const getTooltipMessage = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Verifying:
        return "";
      case VersionProcessedState.Processed:
        return "";
      case VersionProcessedState.Processing:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_processing");
      case VersionProcessedState.Unavailable:
      default:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_unavailable");
    }
  };
  const getProcessSpinner = () => {
    // const percentage =
    //   props.versionState.numberNeededChangesets === 0
    //     ? 0
    //     : Math.floor(
    //       (props.versionState.numberProcessedChangesets / props.versionState.numberNeededChangesets) * 100,
    //     );
    return (
      <div className="date-and-current">
        <div className="vc-spinner-container">
          <div className="vc-spinner-percentage">{100}</div>
        </div>
        <ProgressRadial indeterminate />
      </div>
    );
  };
  const getWaitingMessage = () => {
    return (
      <div className="date-and-current">
        <div className="vc-waiting">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.waiting")}
        </div>
      </div>
    );
  };
  const getAvailableDate = () => {
    return (
      <DateCurrentAndJobStatus createdDate={props.versionState.version.createdDateTime} jobStatus={props.versionState.jobStatus}>
        <div className="state-div">
          <div className={getStateDivClassname()}>{getStateDivMessage()}</div>
          {getStateSecondRow()}
        </div>
      </DateCurrentAndJobStatus>
    );
  };

  const isProcessed = props.versionState.state === VersionProcessedState.Processed;
  const isPreviousAvailable = props.previousEntry.state === VersionProcessedState.Processed;
  const isAvailable = isProcessed && isPreviousAvailable;
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
      title={getTooltipMessage()}
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
            <DateCurrentAndJobStatus createdDate={props.versionState.version.createdDateTime} jobStatus={props.versionState.jobStatus}>
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.verifying")}
            </DateCurrentAndJobStatus>
            <ProgressLinear indeterminate />
          </>
          : isAvailable
            ? getAvailableDate()
            : isPreviousAvailable
              ? getProcessSpinner()
              : getWaitingMessage()
      }
    </div>
  );
}

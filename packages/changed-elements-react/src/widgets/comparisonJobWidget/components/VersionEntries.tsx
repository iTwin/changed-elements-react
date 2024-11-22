/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { Badge, ProgressLinear, Radio, Text } from "@itwin/itwinui-react";
import type { ReactElement, ReactNode } from "react";

import type { NamedVersion } from "../../../clients/iModelsClient";
import {
  VersionProcessedState, type JobProgress, type JobStatus, type VersionState,
} from "../NamedVersions.js";

interface CurrentVersionEntryProps {
  versionState: VersionState;
}

/** Component for current version. Displays the current version's name date description. */
export function CurrentVersionEntry(props: CurrentVersionEntryProps): ReactElement {
  const isProcessed = props.versionState.state === VersionProcessedState.Processed;
  return (
    <div className="vc-entry-current" key={props.versionState.version.changesetId}>
      <VersionNameAndDescription version={props.versionState.version} isProcessed={isProcessed} />
      <DateCurrentAndJobInfo
        createdDate={props.versionState.version.createdDateTime}
        jobStatus={"Unknown"}
      >
        <div className="entry-info">
          {
            props.versionState.version.createdDateTime &&
            new Date(props.versionState.version.createdDateTime).toDateString()
          }
        </div>
        <div className="entry-info">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.current")}
        </div>
      </DateCurrentAndJobInfo>
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

interface VersionListEntryProps {
  versionState: VersionState;
  isSelected: boolean;
  onClicked: (targetVersion: NamedVersion) => void;
}

/**
 * Named Version List Entry. Displays the job information. The job will be between
 * this version and the current version. Displays the description and name of the
 * version as well.
 */
export function VersionListEntry(props: VersionListEntryProps): ReactElement {
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

    props.onClicked(props.versionState.version);
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
      <VersionNameAndDescription version={props.versionState.version} isProcessed={isProcessed} />
      {
        props.versionState.state === VersionProcessedState.Verifying
          ? (
            <>
              <DateCurrentAndJobInfo
                createdDate={props.versionState.version.createdDateTime}
                jobStatus={props.versionState.jobStatus}
                jobProgress={props.versionState.jobProgress}
              >
                {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.verifying")}
              </DateCurrentAndJobInfo>
              <ProgressLinear indeterminate />
            </>
          ) : (
            <DateCurrentAndJobInfo
              createdDate={props.versionState.version.createdDateTime}
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

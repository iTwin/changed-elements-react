/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { Text } from "@itwin/itwinui-react";
import { ReactNode } from "react";
import { VersionList } from "./VersionList";
import { CurrentVersionEntry } from "./VersionEntries";
import { VersionState } from "../models/VersionState";
import { NamedVersion } from "../../../clients/iModelsClient";
import "./styles/ComparisonJobWidget.scss";
import { ManageNamedVersions } from "./VersionCompareManageNamedVersions";

interface VersionCompareSelectorInnerProps {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;
  wantTitle: boolean | undefined;
  /** Optional prop for a user supplied component to handle managing named versions.*/
  manageNamedVersionsSlot: ReactNode | undefined;
}

/**
 * Component that houses named version list.
 * Also displays the current versions information.
 */
export function VersionCompareSelectorInner(props: VersionCompareSelectorInnerProps) {
  return (
    <div className="comparison-job-selector">
      {
        props.currentVersion &&
        <div className="comparison-job-row">
          <div className="current-comparison-title">
            {`${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}:`}
          </div>
          <div className="comparison-job-container-current">
            <CurrentVersionEntry versionState={props.currentVersion} />
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
            currentVersion={props.currentVersion}
            selectedVersionChangesetId={props.selectedVersionChangesetId}
            onVersionClicked={props.onVersionClicked}
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

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { ReactElement } from "react";
import { VersionListEntry } from "./VersionEntries";
import { VersionState } from "../models/VersionState";
import { NamedVersion } from "../../../clients/iModelsClient";
import "./styles/ComparisonJobWidget.scss";
import { LoadingSpinner } from "@itwin/core-react";

interface VersionListProps {
  entries: VersionState[];
  currentVersion: VersionState;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;

  /** If true display loading spinner to indicate we are receiving more named versions*/
  isPaging: boolean;
}

/**
 * Component that displays named versions (non current).
 */
export function VersionList(props: VersionListProps): ReactElement {
  return (
    <div className="comparison-job-row comparison-job-list">
      <div className="comparison-job-container-table">
        <div className="comparison-job-container-header">
          <div className="comparison-job-header">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versions")}
          </div>
          <div className="status-header">
            {"Comparison Status"}
          </div>
        </div>
        <div className="comparison-job-container">
          {props.entries.map((versionState) => {
            const isSelected = props.selectedVersionChangesetId !== undefined &&
              versionState.version.changesetId === props.selectedVersionChangesetId;
            return (
              <VersionListEntry
                key={versionState.version.changesetId}
                versionState={versionState}
                isSelected={isSelected}
                onClicked={props.onVersionClicked}
              />
            );
          })}
          {props.isPaging && <LoadingSpinner className="vc-spinner-entry-list" />}
        </div>
      </div>
    </div>
  );
}

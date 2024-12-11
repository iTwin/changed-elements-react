/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { LoadingSpinner } from "@itwin/core-react";
import type { ReactElement } from "react";

import type { NamedVersion } from "../../../clients/iModelsClient.js";
import type { VersionState } from "../models/VersionState.js";
import { VersionListEntry } from "./VersionEntries.js";

import "./styles/ComparisonJobWidget.scss";

interface VersionListProps {
  entries: VersionState[];
  currentVersion: VersionState;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;

  /** If true display loading spinner to indicate we are receiving more named versions*/
  isLoading: boolean;
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
          {props.isLoading && <LoadingSpinner className="vc-spinner-entry-list" />}
        </div>
      </div>
    </div>
  );
}

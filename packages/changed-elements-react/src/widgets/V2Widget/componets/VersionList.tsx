import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ReactElement, useEffect, useState } from "react";
import { VersionListEntry } from "./VersionEntries";
import { VersionState } from "../models/VersionState";
import { NamedVersion } from "../../../clients/iModelsClient";
import "./styles/VersionCompareSelectWidget.scss";

interface VersionListProps {
  entries: VersionState[];
  currentVersion: VersionState;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;
}

/**
 * Component that named versions.
 */
export function VersionList(props: VersionListProps): ReactElement {
  return (
    <div className="version-compare-row version-compare-list">
      <div className="version-container-table">
        <div className="version-container-header" style={{ borderBottom:"solid 2px black"}}>
          <div className="version-header">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versions")}
          </div>
          <div className="status-header">
            {"Comparison Status"}
          </div>
        </div>
        <div className="version-container">
          {props.entries.map((versionState, index) => {
            const isSelected = props.selectedVersionChangesetId !== undefined &&
              versionState.version.changesetId === props.selectedVersionChangesetId;
            return (
              <VersionListEntry
                key={versionState.version.changesetId}
                versionState={versionState}
                previousEntry={index === 0 ? props.currentVersion : props.entries[index - 1]}
                isSelected={isSelected}
                onClicked={props.onVersionClicked}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

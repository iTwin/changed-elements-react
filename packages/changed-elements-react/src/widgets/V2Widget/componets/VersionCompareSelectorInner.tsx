import { IModelApp } from "@itwin/core-frontend";
import { Text } from "@itwin/itwinui-react";
import { NamedVersion } from "../../..";
import { VersionList } from "./VersionList";
import { CurrentVersionEntry } from "./VersionEntries";
import "./styles/VersionCompareSelectWidget.scss";
import { VersionState } from "../models/VersionState";

interface VersionCompareSelectorInnerProps {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;
  wantTitle: boolean | undefined;
  versionsUrl?: string | undefined;
}

export function VersionCompareSelectorInner(props: VersionCompareSelectorInnerProps) {
  return (
    <div className="version-compare-selector">
      {
        props.currentVersion &&
        <div className="version-compare-row">
          <div className="version-compare-label">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparing")}
          </div>
          <div className="version-container-current">
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
        props.versionsUrl &&
        <div className="version-selector-manage-link">
          <a href={props.versionsUrl} target="_blank" rel="noopener noreferrer" className="message">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.manageNamedVersions")}
          </a>
        </div>
      }
    </div>
  );
}

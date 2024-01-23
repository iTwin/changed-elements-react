import { IModelApp } from "@itwin/core-frontend";
import { Button, Text } from "@itwin/itwinui-react";
import { ReactNode } from "react";
import { NamedVersion } from "../..";
import { VersionState } from "../VersionCompareSelectWidget";
import { VersionList } from "./VersionList";
import { CurrentVersionEntry } from "./VersionEntries";
import "./VersionCompareSelectWidget.scss";

interface VersionCompareSelectorInnerProps {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;
  onStartComparison: () => void;
  wantTitle: boolean | undefined;
  versionsUrl?: string | undefined;
}

export function VersionCompareSelectorInner(props:VersionCompareSelectorInnerProps) {
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
      {
        <div className="version-selector-footer">
          <Button onClick={props.onStartComparison}>
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}
          </Button>
        </div>
      }
    </div>
  );
}

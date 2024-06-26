/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@itwin/core-frontend";
import { ReactNode, useState } from "react";
import { ProgressRadial } from "@itwin/itwinui-react";
import { VersionCompareSelectorInner } from "./VersionCompareSelectorInner";
import { CurrentNamedVersionAndNamedVersions } from "../models/NamedVersions";
import { NamedVersion } from "../../../clients/iModelsClient";
import { ChangesetChunk } from "../../../api/ChangedElementsApiClient";
import "./styles/ComparisonJobWidget.scss";

/** Options for VersionCompareSelectComponent. */
export interface VersionCompareSelectorProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /** Optional handler for when a version is selected. */
  onVersionSelected: (currentVersion: NamedVersion, targetVersion: NamedVersion, chunks?: ChangesetChunk[]) => void;

  /** Whether to show a title for the component or not. */
  wantTitle?: boolean;
  
  /** Named Versions to be displayed */
  namedVersions: CurrentNamedVersionAndNamedVersions | undefined;

  /** Optional prop for a user supplied component to handle managing named versions.*/
  manageNamedVersionsSlot?: ReactNode | undefined;

  /** If true display loading spinner to indicate we are receiving more named versions*/
  isPaging: boolean;
}

/**
 * Component that lets the user select which named version to compare to.
 */
export function VersionCompareSelectComponent(props: VersionCompareSelectorProps) {
  const [targetVersion, setTargetVersion] = useState<NamedVersion>();

  const handleVersionClicked = (targetVersion: NamedVersion) => {
    setTargetVersion(targetVersion);
    if (props.namedVersions && props.namedVersions.currentVersion) {
      props.onVersionSelected?.(
        props.namedVersions.currentVersion.version,
        targetVersion,
      );
    }
  };

  return props.namedVersions ? <VersionCompareSelectorInner
    entries={props.namedVersions.entries}
    currentVersion={props.namedVersions.currentVersion}
    selectedVersionChangesetId={targetVersion?.changesetId ?? undefined}
    onVersionClicked={handleVersionClicked}
    wantTitle={props.wantTitle}
    manageNamedVersionsSlot={props.manageNamedVersionsSlot}
    isPaging={props.isPaging}
  /> : <div className="vc-spinner">
    <ProgressRadial size="large" indeterminate />
  </div>;
}

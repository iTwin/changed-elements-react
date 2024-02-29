/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@itwin/core-frontend";
import { useState } from "react";
import { ProgressRadial } from "@itwin/itwinui-react";
import { VersionCompareSelectorInner } from "./VersionCompareSelectorInner";
import { CurrentNamedVersionAndNamedVersions } from "../models/NamedVersions";
import { NamedVersion } from "../../../clients/iModelsClient";
import { ChangesetChunk } from "../../../api/ChangedElementsApiClient";
import "./styles/ComparisonJobWidget.scss";
import { ManageNamedVersionsProps } from "./VersionCompareManageNamedVersions";

/** Options for VersionCompareSelectComponent. */
export interface VersionCompareSelectorProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /** Optional handler for when a version is selected. */
  onVersionSelected: (currentVersion: NamedVersion, targetVersion: NamedVersion, chunks?: ChangesetChunk[]) => void;

  /** Whether to show a title for the component or not. */
  wantTitle?: boolean;

  /** Configure the 'Manage Named Versions' URL. */
  getManageVersionsUrl?: (iModelConnection?: IModelConnection) => string;

  /** Named Versions to be displayed */
  namedVersions: CurrentNamedVersionAndNamedVersions | undefined;

  /**
  * Props for a href that will, on a click, navigate to the provided link or invoke the provided onClick method.
  *
  * Please note if href and both on click are provided; the component will not use on click but will use href instead.
  *
  * ManageNamedVersionLabel will default to `Manage named versions` if not provided.
  */
  manageNamedVersionProps?: ManageNamedVersionsProps;
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
    manageNamedVersionProps={props.manageNamedVersionProps}
  /> : <div className="vc-spinner">
    <ProgressRadial size="large" indeterminate />
  </div>;
}

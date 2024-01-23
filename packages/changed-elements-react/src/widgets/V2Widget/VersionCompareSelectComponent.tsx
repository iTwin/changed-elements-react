import { IModelConnection } from "@itwin/core-frontend";
import { useMemo, useState } from "react";
import { NamedVersion, ChangesetChunk } from "../..";
import { UsePagedNamedVersionLoaderResult } from "./usePagedNamedVersionLoader";
import { ProgressRadial } from "@itwin/itwinui-react";
import { VersionCompareSelectorInner } from "./VersionCompareSelectorInner";
import "./VersionCompareSelectWidget.scss";
import { NamedVersions } from "./NamedVersions";

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

  namedVersions: NamedVersions | undefined;
}



/**
 * Component that let's the user select which named version to compare to. Will automatically call
 * VersionCompare.manager.startComparison with the proper inputs when user presses OK.
 */
export function VersionCompareSelectComponent(props: VersionCompareSelectorProps) {
  const [targetVersion, setTargetVersion] = useState<NamedVersion>();

  const versionsUrl = useMemo(
    () => (0, props.getManageVersionsUrl)?.(props.iModelConnection),
    [props.getManageVersionsUrl, props.iModelConnection],
  );
  const handleVersionClicked = (targetVersion: NamedVersion) => {
    setTargetVersion(targetVersion);
    if (props.namedVersions) {
      props.onVersionSelected?.(
        props.namedVersions.currentVersion!.version,
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
    versionsUrl={versionsUrl}
  /> : <div className="vc-spinner">
    <ProgressRadial size="large" indeterminate />
  </div>;
}

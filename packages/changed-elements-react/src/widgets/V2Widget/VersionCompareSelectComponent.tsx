import { IModelConnection } from "@itwin/core-frontend";
import { useMemo, useState } from "react";
import { NamedVersion, ChangesetChunk } from "../..";
import { UsePagedNamedVersionLoaderResult } from "./usePagedNamedVersionLoader";
import { ChangedElementsClient } from "../../clients/ChangedElementsClient";
import { ProgressRadial } from "@itwin/itwinui-react";
import { VersionCompareSelectorInner } from "./VersionCompareSelectorInner";
import "./VersionCompareSelectWidget.scss";

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

  comparisonPagedResult: UsePagedNamedVersionLoaderResult | undefined;
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
    if (props.comparisonPagedResult) {
      props.onVersionSelected?.(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        props.comparisonPagedResult.namedVersions.currentVersion!.version,
        targetVersion,
      );
    }
  };

  return props.comparisonPagedResult && props.comparisonPagedResult ? <VersionCompareSelectorInner
    entries={props.comparisonPagedResult.namedVersions.entries}
    currentVersion={props.comparisonPagedResult.namedVersions.currentVersion}
    selectedVersionChangesetId={targetVersion?.changesetId ?? undefined}
    onVersionClicked={handleVersionClicked}
    wantTitle={props.wantTitle}
    versionsUrl={versionsUrl}
  /> : <div className="vc-spinner">
    <ProgressRadial size="large" indeterminate />
  </div>;
}

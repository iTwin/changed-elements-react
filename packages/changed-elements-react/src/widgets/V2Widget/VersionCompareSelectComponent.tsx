import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ReactNode, forwardRef, useEffect, useMemo, useState } from "react";
import { NamedVersion, ChangesetChunk, VersionState, Changeset, VersionCompare, ChangedElementsApiClient, ChangesetStatus } from "../..";
import { useVersionCompare } from "../../VersionCompareContext";
import { jobStatus } from "./JobStatus";
import { VersionProcessedState } from "./VersionProcessedState";
import { splitBeforeEach, flatten, map, skip } from "../../utils/utils";

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

  /** Show start button, useful for non-AppUi applications using the component. */
  wantCompareButton?: boolean;

  /** Compare button react node that will be added to the footer of this component. */
  compareButton?: (onClick: () => void) => ReactNode;

  startComparison: () => void;
}



/**
 * Component that let's the user select which named version to compare to. Will automatically call
 * VersionCompare.manager.startComparison with the proper inputs when user presses OK.
 */
export const VersionCompareSelectComponent = (props: VersionCompareSelectorProps) => {
  // Throw if context is not provided
  const { comparisonJobClient } = useVersionCompare();

  const [targetVersion, setTargetVersion] = useState<NamedVersion>();

  const versionsUrl = useMemo(
    () => (0, props.getManageVersionsUrl)?.(props.iModelConnection),
    [props.getManageVersionsUrl, props.iModelConnection],
  );
  const result = usePagedNamedVersionLoader(props.iModelConnection);
};

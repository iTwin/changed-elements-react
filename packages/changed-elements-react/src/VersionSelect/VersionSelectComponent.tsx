/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./VersionSelectComponent.css";
import { Component, ReactElement } from "react";
import { Localization } from "@itwin/core-common";
import { ProgressRadial, Radio, Text } from "@itwin/itwinui-react";
import { GetChangesetsResult } from "../api/changedElementsApi";

export interface VersionSelectComponentProps {
  localization: Localization;
  changesetId: string;
  changesets: string[];
  changesetStatus: GetChangesetsResult["changesetStatus"];
  namedVersions: NamedVersion[];
  onVersionSelected?: (currentVersion: NamedVersion | undefined, targetVersion: NamedVersion) => void;
}

interface VersionSelectComponentState {
  entries: VersionState[];
  currentVersion: NamedVersion | undefined;
  targetVersion: NamedVersion | undefined;
}

export interface NamedVersion {
  changesetId: string | null;
  createdDateTime: string | undefined;
  name: string;
  description: string | undefined;
}

export class VersionSelectComponent extends Component<VersionSelectComponentProps, VersionSelectComponentState> {
  private _namedVersions: NamedVersionContainer[] | undefined;

  constructor(props: VersionSelectComponentProps) {
    super(props);

    this.state = {
      entries: [],
      currentVersion: undefined,
      targetVersion: undefined,
    };
  }

  private getStateVersions(): NamedVersion[] {
    return this.state.entries.map((versionState) => versionState.version);
  }

  private updateState(_versions: NamedVersion[], targetVersion?: NamedVersion): void {
    const entries: VersionState[] = [];
    let currentVersion: NamedVersion | undefined;
    let foundCurrent = false;
    this._namedVersions?.forEach((nvc) => {
      // We only want to append the named versions before the one we are at
      const isCurrent = this.isCurrent(nvc.version);
      if (isCurrent) {
        foundCurrent = true;
        currentVersion = nvc.version;
      }

      if (!foundCurrent) {
        return;
      }

      if (this._namedVersions && currentVersion?.changesetId && nvc.version.changesetId) {
        const canCompare = VersionUtilities.canCompare(
          this._namedVersions,
          currentVersion.changesetId,
          nvc.version.changesetId,
        );
        entries.push({
          version: nvc.version,
          selected: targetVersion?.changesetId === nvc.version.changesetId,
          current: this.isCurrent(nvc.version),
          state: canCompare ? VersionProcessedState.Processed : VersionProcessedState.Processing,
          numberProcessedChangesets: nvc.numberOfProcessedChangesets,
          numberNeededChangesets: nvc.numberOfNeededChangesets,
        });
      }
    });

    this.setState({
      entries,
      currentVersion,
      targetVersion,
    });
  }

  public override componentDidMount(): void {
    const changeSetId = this.props.changesetId;
    this._namedVersions = this._findAvailableNamedVersions(
      changeSetId,
      this.props.namedVersions,
      this.props.changesets,
      new Set(this.props.changesetStatus.filter((changeset) => changeset.ready).map(({ id }) => id)),
    );
    this.updateState(this.props.namedVersions);
  }

  private _isChangesetAVersion = (changeSetId: string, versions: NamedVersion[]) => {
    return versions.find((v) => v.changesetId === changeSetId) !== undefined;
  };

  private _findAvailableNamedVersions(
    currentChangeSetId: string,
    versions: NamedVersion[],
    allChangesets: string[],
    processedChangesetIds: Set<string>,
  ): NamedVersionContainer[] {
    const namedVersionContainers: NamedVersionContainer[] = [];
    // Manufacture a fake entry for current changeset
    if (!this._isChangesetAVersion(currentChangeSetId, versions)) {
      namedVersionContainers.push(
        new NamedVersionContainer(
          -1,
          versions,
          allChangesets,
          processedChangesetIds,
          currentChangeSetId,
          this.props.localization,
        ),
      );
    }
    versions.forEach((_version: NamedVersion, index: number) => {
      namedVersionContainers.push(
        new NamedVersionContainer(index, versions, allChangesets, processedChangesetIds, "", this.props.localization),
      );
    });
    // Return sorted list in case the current changeset is in between other named versions
    return namedVersionContainers.sort(
      (a: NamedVersionContainer, b: NamedVersionContainer) => a.versionChangesetIndex - b.versionChangesetIndex,
    );
  }

  private formatDate(date: string | undefined): string {
    if (!date) {
      return "";
    }

    return new Date(date).toDateString();
  }

  private isCurrent(version: NamedVersion): boolean {
    return this.props.changesetId === version.changesetId;
  }

  private _createEntry = (version: VersionState, _previousEntry: VersionState, entryClassName: string) => {
    const handleClick = () => {
      if (version.state !== VersionProcessedState.Processed || version.current) {
        return;
      }

      this.props.onVersionSelected?.(this.state.currentVersion, version.version);
      this.updateState(this.getStateVersions(), version.version);
    };

    const getTooltipMessage = () => {
      if (version.current) {
        return "";
      }

      switch (version.state) {
        case VersionProcessedState.Processed:
          return "";
        case VersionProcessedState.Processing:
          return this.props.localization.getLocalizedString("VersionCompare:versionCompare.processingVersion");
      }
    };
    const getProcessSpinner = () => {
      const percentage = Math.floor(
        (_previousEntry.numberProcessedChangesets / _previousEntry.numberNeededChangesets) * 100.0,
      );
      return (
        <div className="itwin-changed-elements__vs-loading-percentage itwin-changed-elements__center-items">
          <div>{percentage}</div>
          <ProgressRadial indeterminate />
        </div>
      );
    };
    const getAvailableDate = () => {
      return (
        <div className="itwin-changed-elements__vs-date-and-current">
          <Text variant="small">
            {this.formatDate(version.version.createdDateTime)}
          </Text>
          {
            version.current &&
            <Text className="itwin-changed-elements__vs-current-version-badge" variant="small">
              {this.props.localization.getLocalizedString("VersionCompare:versionCompare.current")}
            </Text>
          }
        </div>
      );
    };

    const isProcessed = version.state === VersionProcessedState.Processed;
    const isPreviousAvailable = _previousEntry.state === VersionProcessedState.Processed;
    const isAvailable = isProcessed && isPreviousAvailable;
    return (
      <div
        className={entryClassName}
        data-selected={version.selected}
        key={version.version.changesetId}
        onClick={handleClick}
        title={getTooltipMessage()}
      >
        {
          !version.current &&
          <Radio
            disabled={!isProcessed}
            checked={version.selected}
            /* c8 ignore next */
            onChange={() => { /* no-op: avoid complaints for missing onChange */ }}
          />
        }
        <div className="itwin-changed-elements__vs-name-and-description">
          <Text isMuted={!isProcessed}>{version.version.name}</Text>
          <Text isMuted={!isProcessed} variant="small">
            {
              !version.version.description
                ? this.props.localization.getLocalizedString("VersionCompare:versionCompare.noDescription")
                : version.version.description
            }
          </Text>
        </div>
        {
          version.current || isAvailable
            ? getAvailableDate()
            : isPreviousAvailable
              ? getProcessSpinner()
              : <div>{this.props.localization.getLocalizedString("VersionCompare:versionCompare.waiting")}</div>
        }
      </div>
    );
  };

  private _getVersionsURL(): string {
    return "";
  }

  public override render(): ReactElement {
    const currentVersionState = this.state.entries
      && this.state.entries.length !== 0 ? this.state.entries[0] : undefined;
    return (
      <div className="itwin-changed-elements__version-selector">
        {
          currentVersionState &&
          <div className="itwin-changed-elements__vs-comparison-base">
            <Text>{this.props.localization.getLocalizedString("VersionCompare:versionCompare.comparing")}</Text>
            {this._createEntry(currentVersionState, currentVersionState, "itwin-changed-elements__vs-current-version")}
          </div>
        }
        <div className="itwin-changed-elements__vs-comparison-targets">
          <Text>{this.props.localization.getLocalizedString("VersionCompare:versionCompare.with")}</Text>
          <div className="itwin-changed-elements__vs-versions-table">
            <Text>{this.props.localization.getLocalizedString("VersionCompare:versionCompare.versions")}</Text>
            <Text>{this.props.localization.getLocalizedString("VersionCompare:versionCompare.changeset")}</Text>
            <div className="itwin-changed-elements__vs-versions-list">
              {
                this.state.entries.length > 1
                  ? this.state.entries.slice(1).map(
                    (versionState, index) => this._createEntry(
                      versionState,
                      this.state.entries[index],
                      "itwin-changed-elements__vs-versions-list-entry",
                    ),
                  )
                  : (
                    <div className="itwin-changed-elements__vs-no-named-versions itwin-changed-elements__center-items">
                      {this.props.localization.getLocalizedString("VersionCompare:versionCompare.noNamedVersions")}
                    </div>
                  )
              }
            </div>
          </div>
        </div>
        <div className="itwin-changed-elements__vs-manage-versions-link">
          <a href={this._getVersionsURL()} target="_blank" rel="noopener noreferrer">
            {this.props.localization.getLocalizedString("VersionCompare:versionCompare.manageNamedVersions")}
          </a>
        </div>
      </div>
    );
  }
}

export interface VersionState {
  version: NamedVersion;
  selected: boolean;
  current: boolean;
  state: VersionProcessedState;
  numberNeededChangesets: number;
  numberProcessedChangesets: number;
}

enum VersionProcessedState {
  Processed,
  Processing,
}

export class VersionUtilities {
  /**
   * Checks whether version compare can be started against two versions by making sure all named versions in between are
   * processed.
   * @param versions Versions to use
   * @param versionAId Id of the first version
   * @param versionBId Id of the second version
   */
  public static canCompare(versions: NamedVersionContainer[], versionAId: string, versionBId: string): boolean {
    const aIndex = versions.findIndex((version) => version.version.changesetId === versionAId);
    const bIndex = versions.findIndex((version) => version.version.changesetId === versionBId);
    const necessaryVersions = versions.slice(Math.min(aIndex, bIndex), Math.max(aIndex, bIndex));
    return necessaryVersions.every((version) => version.isAvailable);
  }
}

/**
 * Class to check if all necessary changesets for comparison are processed given named versions, changesets, and a set
 * of processed changeset ids.
 */
export class NamedVersionContainer {
  public version: NamedVersion;
  public versionChangesetIndex: number;
  public isAvailable: boolean;
  private _neededChangesetIds: string[];
  private _numProcessed: number;

  /**
   * Create a NamedVersionContainer and compute if it's available for comparison.
   * @param versionIndex Index of the named version to check
   * @param allVersions Named Versions
   * @param allChangesets Changesets sorted by index in descending order
   * @param processedChangesetIds Set of changeset Ids that have been processed already
   */
  constructor(
    versionIndex: number,
    allVersions: NamedVersion[],
    allChangesets: string[],
    processedChangesetIds: Set<string>,
    currentChangeSetId: string,
    localization: Localization,
  ) {
    // Handle case in which we are manufacturing a fake container for latest changeset
    if (versionIndex === -1) {
      const isLatestChangeset = allChangesets[0] === currentChangeSetId;
      const name = isLatestChangeset
        ? localization.getLocalizedString("VersionCompare:versionCompare.latestChangeset")
        : localization.getLocalizedString("VersionCompare:versionCompare.currentChangeset");
      this.version = {
        name,
        changesetId: currentChangeSetId,
        description: undefined,
        createdDateTime: undefined,
      };
    } else {
      this.version = allVersions[versionIndex];
    }

    // Find index of changeset for this named version
    this.versionChangesetIndex = allChangesets.findIndex((cs) => this.version.changesetId === cs);
    if (this.versionChangesetIndex === -1) {
      throw new Error("Invalid Named Version given, no changeset found that matches it in the iModel");
    }

    // Find all indices of other named versions
    const allVersionsChangesetIndices: number[] = [];
    allVersions.forEach((currentVersion) => {
      const currentIndex = allChangesets.findIndex((cs) => currentVersion.changesetId === cs);
      if (currentIndex !== -1) {
        allVersionsChangesetIndices.push(currentIndex);
      }
    });
    allVersionsChangesetIndices.sort();

    // Find the position of the current named versions index in the array
    const indexOfThisVersion = allVersionsChangesetIndices.findIndex(
      (value) => value === this.versionChangesetIndex,
    );
    let indexOfTargetVersion = indexOfThisVersion + 1;
    if (indexOfTargetVersion > allVersionsChangesetIndices.length - 1) {
      indexOfTargetVersion = indexOfThisVersion;
    }

    // Index of the target version's changeset that we must process to
    const targetVersionChangesetIndex = allVersionsChangesetIndices[indexOfTargetVersion];

    // Check that all needed changesets are processed
    this._neededChangesetIds = allChangesets.slice(
      Math.min(this.versionChangesetIndex, targetVersionChangesetIndex),
      Math.max(this.versionChangesetIndex, targetVersionChangesetIndex),
    );

    // Add all changesets down to the bottom if we are in the last named version of the list
    if (indexOfThisVersion === allVersionsChangesetIndices.length - 1) {
      const changesetsToBottom = allChangesets.filter(
        (_cs, index) => index > allVersionsChangesetIndices[indexOfThisVersion],
      );
      changesetsToBottom.forEach((cs) => this._neededChangesetIds.push(cs));
    }

    this.isAvailable = NamedVersionContainer.setHasAllStrings(this._neededChangesetIds, processedChangesetIds);
    this._numProcessed = NamedVersionContainer.numberOfChangesetsProcessed(
      this._neededChangesetIds,
      processedChangesetIds,
    );
  }

  public get numberOfProcessedChangesets(): number {
    return this._numProcessed;
  }

  public get numberOfNeededChangesets(): number {
    return this._neededChangesetIds.length;
  }

  /**
   * Checks if the set of strings contains all the strings in the given array
   * @param strings Strings to test
   * @param set Set of strings
   */
  public static setHasAllStrings(strings: string[], set: Set<string>): boolean {
    for (const str of strings) {
      if (!set.has(str)) {
        return false;
      }
    }

    return true;
  }

  public static numberOfChangesetsProcessed(neededIds: string[], set: Set<string>): number {
    let count = 0;
    for (const str of neededIds) {
      if (set.has(str)) {
        count++;
      }
    }

    return count;
  }
}

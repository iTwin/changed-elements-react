/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Logger } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import {
  Button, Modal, ModalButtonBar, ModalContent, ProgressLinear, ProgressRadial, Radio, Text
} from "@itwin/itwinui-react";
import {
  Component, createRef, forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactElement, type ReactNode
} from "react";

import { useVersionCompare } from "../VersionCompareContext.js";
import type { ChangedElementsApiClient, ChangesetChunk, ChangesetStatus } from "../api/ChangedElementsApiClient.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages.js";
import { VersionCompare } from "../api/VersionCompare.js";
import { Changeset, NamedVersion } from "../clients/iModelsClient.js";

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

  /** Show start button, useful for non-AppUi applications using the component. */
  wantCompareButton?: boolean;

  /** Compare button react node that will be added to the footer of this component. */
  compareButton?: (onClick: () => void) => ReactNode;
}

interface VersionCompareSelectComponentAttributes {
  startComparison: () => void;
}

/**
 * Component that let's the user select which named version to compare to. Will automatically call
 * VersionCompare.manager.startComparison with the proper inputs when user presses OK.
 */
export const VersionCompareSelectComponent = forwardRef<
  VersionCompareSelectComponentAttributes,
  VersionCompareSelectorProps
>(
  function VersionCompareSelectComponent(props, ref): ReactElement {
    // Throw if context is not provided
    useVersionCompare();

    const [targetVersion, setTargetVersion] = useState<NamedVersion>();

    const versionsUrl = useMemo(
      () => (0, props.getManageVersionsUrl)?.(props.iModelConnection),
      [props.getManageVersionsUrl, props.iModelConnection],
    );

    const versionSelector = (
      namedVersions: NamedVersions | undefined,
      handleStartComparison: (targetVersion: NamedVersion | undefined) => void,
    ) => {
      if (!namedVersions) {
        return (
          <div className="vc-spinner">
            <ProgressRadial size="large" indeterminate />
          </div>
        );
      }

      const handleVersionClicked = (targetVersion: NamedVersion) => {
        setTargetVersion(targetVersion);
        props.onVersionSelected?.(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          namedVersions.currentVersion!.version,
          targetVersion,
        );
      };

      return (
        <VersionCompareSelectorInner
          ref={ref}
          entries={namedVersions.entries}
          currentVersion={namedVersions.currentVersion}
          selectedVersionChangesetId={targetVersion?.changesetId ?? undefined}
          onVersionClicked={handleVersionClicked}
          onStartComparison={() => handleStartComparison(targetVersion)}
          wantTitle={props.wantTitle}
          wantCompareButton={props.wantCompareButton}
          compareButton={props.compareButton}
          versionsUrl={versionsUrl}
        />
      );
    };

    return (
      <PagedNamedVersionProvider iModelConnection={props.iModelConnection}>
        {versionSelector}
      </PagedNamedVersionProvider>
    );
  },
);

interface PagedNamedVersionProviderProps {
  iModelConnection: IModelConnection | undefined;
  children: (
    namedVersions: NamedVersions | undefined,
    onStartComparison: (targetVersion: NamedVersion | undefined) => void
  ) => ReactElement;
}

function PagedNamedVersionProvider(props: PagedNamedVersionProviderProps): ReactElement {
  const result = usePagedNamedVersionLoader(props.iModelConnection);
  const handleStartComparison = async (targetVersion: NamedVersion | undefined) => {
    if (VersionCompare.manager?.isComparing) {
      await VersionCompare.manager?.stopComparison();
    }

    const currentVersion = result?.namedVersions.currentVersion?.version;
    if (currentVersion && targetVersion && props.iModelConnection) {
      const currentIndex = result.changesets.findIndex((changeset) => changeset.id === currentVersion.changesetId);
      const targetIndex = result.changesets.findIndex((changeset) => changeset.id === targetVersion.changesetId);
      const relevantChangesets = result.changesets.slice(currentIndex, targetIndex - currentIndex).reverse();

      const chunkSize = 200;
      const chunks: ChangesetChunk[] = [];
      for (let i = 0; i < relevantChangesets.length; i += chunkSize) {
        chunks.push({
          startChangesetId: relevantChangesets[i].id,
          endChangesetId: relevantChangesets[Math.min(i + chunkSize, relevantChangesets.length) - 1].id,
        });
      }

      VersionCompare.manager
        ?.startComparison(props.iModelConnection, currentVersion, targetVersion, undefined, chunks)
        .catch((e) => {
          Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
        });
    }
  };

  return props.children(result?.namedVersions, handleStartComparison);
}

interface UsePagedNamedVersionLoaderResult {
  /** Named versions to display in the list. */
  namedVersions: NamedVersions;

  /** Changesets in descending index order. */
  changesets: Changeset[];
}

interface NamedVersions {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
}

function usePagedNamedVersionLoader(
  iModelConnection: IModelConnection | undefined,
): UsePagedNamedVersionLoaderResult | undefined {
  const [result, setResult] = useState<UsePagedNamedVersionLoaderResult>();
  const { iModelsClient } = useVersionCompare();

  useEffect(
    () => {
      const iTwinId = iModelConnection?.iTwinId;
      const iModelId = iModelConnection?.iModelId;
      const changesetId = iModelConnection?.changeset.id;
      const manager = VersionCompare.manager;
      if (!iTwinId || !iModelId || !changesetId || !manager) {
        setResult({
          namedVersions: { entries: [], currentVersion: undefined },
          changesets: [],
        });
        return;
      }

      let disposed = false;
      void (async () => {
        const [namedVersions, changesets] = await Promise.all([
          iModelsClient.getNamedVersions({ iModelId }),
          // Changesets need to be in descending index order
          iModelsClient.getChangesets({ iModelId }).then((changesets) => changesets.slice().reverse()),
        ]);
        if (disposed) {
          return;
        }

        // Each changeset has an index property, but here we retrieve a changeset index in backwards-sorted array
        const currentChangesetGlobalReverseIndex = changesets.findIndex(({ id }) => id === changesetId);
        if (currentChangesetGlobalReverseIndex === -1) {
          // Early exit due to bad data
          setResult({
            namedVersions: { entries: [], currentVersion: undefined },
            changesets: [],
          });
          return;
        }

        // Changesets that are applied after the current changeset are irrelevant
        changesets.splice(0, currentChangesetGlobalReverseIndex);
        const changesetIdToReverseIndex = new Map(changesets.map((changeset, index) => [changeset.id, index]));

        // Reorder and filter named versions based on changeset order
        const sortedNamedVersions: Array<{ namedVersion: NamedVersion; changesetReverseIndex: number; }> = [];
        for (const namedVersion of namedVersions) {
          const reverseIndex = namedVersion.changesetId
            ? changesetIdToReverseIndex.get(namedVersion.changesetId)
            : undefined;
          if (reverseIndex !== undefined) {
            sortedNamedVersions.push({ namedVersion, changesetReverseIndex: reverseIndex });
          }
        }

        sortedNamedVersions.sort((a, b) => a.changesetReverseIndex - b.changesetReverseIndex);
        if (sortedNamedVersions.length === 0) {
          setResult({
            namedVersions: { entries: [], currentVersion: undefined },
            changesets: [],
          });
          return;
        }

        // Obtain current named version or manufacture an entry for one
        let currentVersion: NamedVersion;
        if (sortedNamedVersions[0].namedVersion.changesetId === changesetId) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          currentVersion = sortedNamedVersions.shift()!.namedVersion;
        } else {
          currentVersion = {
            id: "",
            displayName: IModelApp.localization.getLocalizedString(
              currentChangesetGlobalReverseIndex === 0
                ? "VersionCompare:versionCompare.latestChangeset"
                : "VersionCompare:versionCompare.currentChangeset",
            ),
            changesetId: changesetId,
            changesetIndex: -1,
            description: null,
            createdDateTime: "",
          };
        }

        const currentVersionState: VersionState = {
          version: currentVersion,
          state: VersionProcessedState.Processed,
          numberNeededChangesets: 0,
          numberProcessedChangesets: 0,
        };

        const client = VersionCompare.clientFactory.createChangedElementsClient() as ChangedElementsApiClient;
        const pageIterator = client.getChangesetsPaged({
          iTwinId,
          iModelId,
          skip: changesets.length,
          backwards: true,
        });
        const splitChangesets = splitBeforeEach(
          flatten(map(pageIterator, (changeset) => changeset.reverse())),
          (changeset) => changeset.id,
          [
            currentVersion.changesetId,
            ...sortedNamedVersions.map(({ namedVersion: { changesetId } }) => changesetId),
          ],
        );

        let currentNamedVersionIndex = 0;
        const currentState = {
          result: {
            namedVersions: {
              entries: sortedNamedVersions.map(({ namedVersion }) => ({
                version: namedVersion,
                state: VersionProcessedState.Verifying,
                numberNeededChangesets: 0,
                numberProcessedChangesets: 0,
              })),
              currentVersion: currentVersionState,
            },
            changesets,
          },
        };

        setResult(currentState.result);
        if (sortedNamedVersions.length === 0) {
          return;
        }

        const changesetStatusIterable = skip(splitChangesets, 1);
        let result: IteratorResult<ChangesetStatus[]>;
        while (result = await changesetStatusIterable.next(), !result.done) {
          // We must avoid modifying the current state cache if component is unmounted
          if (disposed) {
            return;
          }

          const changesets = result.value;
          const numProcessedChangesets = changesets.reduce((acc, curr) => acc + Number(curr.ready), 0);
          const isProcessed = changesets.length === numProcessedChangesets;
          const newEntries = currentState.result.namedVersions.entries.map((entry, index) => {
            if (index === currentNamedVersionIndex) {
              return {
                version: sortedNamedVersions[currentNamedVersionIndex].namedVersion,
                state: isProcessed ? VersionProcessedState.Processed : VersionProcessedState.Processing,
                numberNeededChangesets: changesets.length,
                numberProcessedChangesets: numProcessedChangesets,
              };
            }

            if (index > currentNamedVersionIndex && !isProcessed) {
              return {
                version: entry.version,
                state: VersionProcessedState.Processing,
                numberNeededChangesets: 0,
                numberProcessedChangesets: 0,
              };
            }

            return entry;
          });

          currentState.result = {
            namedVersions: { currentVersion: currentVersionState, entries: newEntries },
            changesets: currentState.result.changesets,
          };
          setResult(currentState.result);

          if (!isProcessed) {
            break;
          }

          currentNamedVersionIndex += 1;
          if (currentNamedVersionIndex === sortedNamedVersions.length) {
            break;
          }
        }
      })();

      return () => {
        disposed = true;
      };
    },
    [iModelConnection, iModelsClient],
  );

  return result;
}

async function* map<T, U>(iterable: AsyncIterable<T>, transform: (value: T) => U): AsyncGenerator<U> {
  for await (const value of iterable) {
    yield transform(value);
  }
}

async function* flatten<T>(iterable: AsyncIterable<T[]>): AsyncGenerator<T> {
  for await (const values of iterable) {
    for (const value of values) {
      yield value;
    }
  }
}

async function* splitBeforeEach<T, U>(
  iterable: AsyncIterable<T>,
  selector: (value: T) => U,
  markers: U[],
): AsyncGenerator<T[]> {
  let accumulator: T[] = [];
  let currentMarkerIndex = 0;
  for await (const value of iterable) {
    if (currentMarkerIndex !== markers.length && selector(value) === markers[currentMarkerIndex]) {
      yield accumulator;
      accumulator = [];
      ++currentMarkerIndex;
    }

    accumulator.push(value);
  }

  yield accumulator;
}

async function* skip<T>(iterable: AsyncIterable<T>, n: number): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  for (let i = 0; i < n; ++i) {
    const result = await iterator.next();
    if (result.done) {
      return result.value;
    }
  }

  let result = await iterator.next();
  while (!result.done) {
    yield result.value;
    result = await iterator.next();
  }

  return result.value;
}

enum VersionProcessedState {
  Verifying,
  Processed,
  Processing,
  Unavailable,
}

export interface VersionState {
  version: NamedVersion;
  state: VersionProcessedState;
  numberNeededChangesets: number;
  numberProcessedChangesets: number;
}

interface VersionCompareSelectorInnerProps {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;
  onStartComparison: () => void;
  wantTitle: boolean | undefined;
  wantCompareButton: boolean | undefined;
  compareButton: ((onClick: () => void) => ReactNode) | undefined;
  versionsUrl?: string | undefined;
}

const VersionCompareSelectorInner = forwardRef<
  VersionCompareSelectComponentAttributes,
  VersionCompareSelectorInnerProps
>(
  function VersionCompareSelectorInner(props, ref): ReactElement {
    useImperativeHandle(
      ref,
      () => ({ startComparison: props.onStartComparison }),
      [props.onStartComparison],
    );

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
          props.wantCompareButton && props.compareButton === undefined &&
          <div className="version-selector-footer">
            <Button onClick={props.onStartComparison}>
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}
            </Button>
          </div>
        }
        {props.compareButton?.(props.onStartComparison)}
      </div>
    );
  },
);

interface VersionListProps {
  entries: VersionState[];
  currentVersion: VersionState;
  selectedVersionChangesetId: string | undefined;
  onVersionClicked: (targetVersion: NamedVersion) => void;
}

function VersionList(props: VersionListProps): ReactElement {
  return (
    <div className="version-compare-list">
      <div className="version-compare-label">
        {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.with")}
      </div>
      <div className="version-container-table">
        <div className="version-container-header">
          <div className="version-header">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versions")}
          </div>
          <div className="date-header">
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.changeset")}
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

interface VersionListEntryProps {
  versionState: VersionState;
  previousEntry: VersionState;
  isSelected: boolean;
  onClicked: (targetVersion: NamedVersion) => void;
}

function VersionListEntry(props: VersionListEntryProps): ReactElement {
  const handleClick = async () => {
    if (props.versionState.state !== VersionProcessedState.Processed) {
      return;
    }

    props.onClicked(props.versionState.version);
  };

  const getStateDivClassname = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Processed:
        return "current-empty";
      case VersionProcessedState.Processing:
        return "state-processing";
      case VersionProcessedState.Unavailable:
      default:
        return "state-unavailable";
    }
  };
  const getStateDivMessage = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Processed:
        return "";
      case VersionProcessedState.Processing: {
        return IModelApp.localization.getLocalizedString(
          props.versionState.numberNeededChangesets === props.versionState.numberProcessedChangesets
            ? "VersionCompare:versionCompare.processed"
            : "VersionCompare:versionCompare.processing",
        );
      }
      case VersionProcessedState.Unavailable:
      default:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.unavailable");
    }
  };
  const getStateSecondRow = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Processing: {
        const processedStateMsg =
          (props.versionState.numberNeededChangesets === 0
            ? 0
            : Math.floor(
              (props.versionState.numberProcessedChangesets / props.versionState.numberNeededChangesets) * 100,
            )) + "%";
        return <div className="state-second-row">{processedStateMsg}</div>;
      }
      case VersionProcessedState.Unavailable:
        return <span className="state-second-row-warning icon icon-status-warning" />;
      case VersionProcessedState.Processed:
      default:
        return undefined;
    }
  };
  const getTooltipMessage = () => {
    switch (props.versionState.state) {
      case VersionProcessedState.Verifying:
        return "";
      case VersionProcessedState.Processed:
        return "";
      case VersionProcessedState.Processing:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_processing");
      case VersionProcessedState.Unavailable:
      default:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_unavailable");
    }
  };
  const getProcessSpinner = () => {
    const percentage =
      props.versionState.numberNeededChangesets === 0
        ? 0
        : Math.floor(
          (props.versionState.numberProcessedChangesets / props.versionState.numberNeededChangesets) * 100,
        );
    return (
      <div className="date-and-current">
        <div className="vc-spinner-container">
          <div className="vc-spinner-percentage">{percentage}</div>
        </div>
        <ProgressRadial indeterminate />
      </div>
    );
  };
  const getWaitingMessage = () => {
    return (
      <div className="date-and-current">
        <div className="vc-waiting">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.waiting")}
        </div>
      </div>
    );
  };
  const getAvailableDate = () => {
    return (
      <DateAndCurrent createdDate={props.versionState.version.createdDateTime}>
        <div className="state-div">
          <div className={getStateDivClassname()}>{getStateDivMessage()}</div>
          {getStateSecondRow()}
        </div>
      </DateAndCurrent>
    );
  };

  const isProcessed = props.versionState.state === VersionProcessedState.Processed;
  const isPreviousAvailable = props.previousEntry.state === VersionProcessedState.Processed;
  const isAvailable = isProcessed && isPreviousAvailable;
  return (
    <div
      className={
        isProcessed
          ? props.isSelected
            ? "vc-entry selected"
            : "vc-entry"
          : "vc-entry unprocessed"
      }
      onClick={handleClick}
      title={getTooltipMessage()}
    >
      <div className="vcs-checkbox">
        <Radio
          disabled={!isProcessed}
          checked={props.isSelected}
          onChange={() => { /* no-op: avoid complaints for missing onChange */ }}
        />
      </div>
      <VersionNameAndDescription version={props.versionState.version} isProcessed={isProcessed} />
      {
        props.versionState.state === VersionProcessedState.Verifying
          ? <>
            <DateAndCurrent createdDate={props.versionState.version.createdDateTime}>
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.verifying")}
            </DateAndCurrent>
            <ProgressLinear indeterminate />
          </>
          : isAvailable
            ? getAvailableDate()
            : isPreviousAvailable
              ? getProcessSpinner()
              : getWaitingMessage()
      }
    </div>
  );
}

interface CurrentVersionEntryProps {
  versionState: VersionState;
}

function CurrentVersionEntry(props: CurrentVersionEntryProps): ReactElement {
  const isProcessed = props.versionState.state === VersionProcessedState.Processed;
  return (
    <div className="vc-entry-current" key={props.versionState.version.changesetId}>
      <VersionNameAndDescription version={props.versionState.version} isProcessed={isProcessed} />
      <DateAndCurrent createdDate={props.versionState.version.createdDateTime}>
        <div className="current-show">
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.current")}
        </div>
      </DateAndCurrent>
    </div>
  );
}

interface DateAndCurrentProps {
  createdDate?: string;
  children: ReactNode;
}

function DateAndCurrent(props: DateAndCurrentProps): ReactElement {
  return (
    <div className="date-and-current">
      <div className="date">
        {props.createdDate ? new Date(props.createdDate).toDateString() : ""}
      </div>
      {props.children}
    </div>
  );
}

interface VersionNameAndDescriptionProps {
  version: NamedVersion;
  isProcessed: boolean;
}

function VersionNameAndDescription(props: VersionNameAndDescriptionProps): ReactElement {
  return (
    <div className="name-and-description">
      <div className={props.isProcessed ? "name" : "name-unprocessed"}>
        {props.version.displayName}
      </div>
      <div className={props.isProcessed ? "description" : "description-unprocessed"}>
        {props.version.description === ""
          ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noDescription")
          : props.version.description}
      </div>
    </div>
  );
}

export interface VersionCompareSelectDialogState {
  targetVersion: NamedVersion | undefined;
  currentVersion: NamedVersion | undefined;
}

export interface VersionCompareSelectDialogProps {
  iModelConnection: IModelConnection;
  isOpen: boolean;
  onClose?: (() => void) | undefined;
}

/** Version Compare Select Dialog to start compariosn with by selecting a target named version */
export class VersionCompareSelectDialog extends Component<
  VersionCompareSelectDialogProps,
  VersionCompareSelectDialogState
> {
  private versionSelectComponentRef = createRef<VersionCompareSelectComponentAttributes>();

  constructor(props: VersionCompareSelectDialogProps) {
    super(props);
    this.state = {
      targetVersion: undefined,
      currentVersion: undefined,
    };
  }

  private _handleOk = async (): Promise<void> => {
    this.versionSelectComponentRef.current?.startComparison();

    this.props.onClose?.();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
  };

  private _handleCancel = (): void => {
    this.props.onClose?.();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
  };

  private _onVersionSelected = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
    this.setState({
      ...this.state,
      targetVersion,
      currentVersion,
    });
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogOpened);
  };

  public override componentDidMount(): void {
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogOpened);
  }

  public override render(): ReactElement {
    return (
      <Modal
        className="version-compare-dialog"
        title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionPickerTitle")}
        isOpen={this.props.isOpen}
        onClose={this._handleCancel}
      >
        <ModalContent>
          <VersionCompareSelectComponent
            ref={this.versionSelectComponentRef}
            iModelConnection={this.props.iModelConnection}
            onVersionSelected={this._onVersionSelected}
            getManageVersionsUrl={VersionCompare.manager?.options.getManageNamedVersionsUrl}
          />
        </ModalContent>
        <ModalButtonBar>
          <Button
            styleType="high-visibility"
            disabled={this.state.targetVersion === undefined}
            onClick={this._handleOk}
          >
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}
          </Button>
          <Button onClick={this._handleCancel}>
            {IModelApp.localization.getLocalizedString("UiCore:dialog.cancel")}
          </Button>
        </ModalButtonBar>
      </Modal>
    );
  }
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ModalDialogManager, ToolButton } from "@itwin/appui-react";
import { BeEvent, Logger } from "@itwin/core-bentley";
import {
  IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority
} from "@itwin/core-frontend";
import { LoadingSpinner, SpinnerSize } from "@itwin/core-react";
import { MinimalChangeset, NamedVersion, NamedVersionState } from "@itwin/imodels-client-management";
import { Button, Modal, ModalButtonBar, ModalContent, ProgressLinear, Radio } from "@itwin/itwinui-react";
import {
  Component, createRef, forwardRef, ReactElement, ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState
} from "react";

import type { ChangedElementsApiClient, ChangesetChunk, ChangesetStatus } from "../api/ChangedElementsApiClient.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages.js";
import { VersionCompare } from "../api/VersionCompare.js";
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

  /** Show start button, useful for non-ninezone applications using the component. */
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
    const [targetVersion, setTargetVersion] = useState<NamedVersion>();

    const versionsUrl = useMemo(
      () => props.getManageVersionsUrl?.(props.iModelConnection),
      [props.getManageVersionsUrl, props.iModelConnection],
    );

    const versionSelector = (
      namedVersions: NamedVersions | undefined,
      handleStartComparison: (targetVersion: NamedVersion | undefined) => void,
    ) => {
      if (!namedVersions) {
        return (
          <div className="vc-spinner">
            <LoadingSpinner />
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
  changesets: MinimalChangeset[];
}

interface NamedVersions {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
}

interface PagedNamedVersionLoaderStateCache {
  iTwinId: string;
  iModelId: string;
  changesetId: string;
  changesetStatusIterable: SuspendableAsyncIterable<ChangesetStatus[]>;
  currentNamedVersionIndex: number;
  result: UsePagedNamedVersionLoaderResult;
}

let pagedNamedVersionLoaderStateCache: PagedNamedVersionLoaderStateCache | undefined;

function usePagedNamedVersionLoader(
  iModelConnection: IModelConnection | undefined,
): UsePagedNamedVersionLoaderResult | undefined {
  // The cache is stored in a global variable but it can only have one owner
  const cache = useRef(pagedNamedVersionLoaderStateCache);
  pagedNamedVersionLoaderStateCache = undefined;

  const [result, setResult] = useState<UsePagedNamedVersionLoaderResult>();

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
          manager.changesetCache.getVersions(iModelId),
          // Changesets are assumed to be in descending index order
          manager.changesetCache.getOrderedChangesets(iModelId),
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
            name: "",
            description: null,
            createdDateTime: "",
            _links: { changeset: null, creator: null },
            state: NamedVersionState.Hidden,
            application: null,
            getCreator: async () => undefined,
            getChangeset: async () => undefined,
          };
        }

        const currentVersionState: VersionState = {
          version: currentVersion,
          state: VersionProcessedState.Processed,
          numberNeededChangesets: 0,
          numberProcessedChangesets: 0,
        };

        // Initialize iteration if we cannot continue from cache
        if (
          !cache.current ||
          cache.current.iTwinId !== iTwinId ||
          cache.current.iModelId !== iModelId ||
          cache.current.changesetId !== changesetId
        ) {
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
              ...sortedNamedVersions.map(({ namedVersion }) => namedVersion.changesetId),
            ],
          );
          cache.current = {
            iTwinId,
            iModelId,
            changesetId,
            changesetStatusIterable: suspendable(skip(splitChangesets, 1)),
            currentNamedVersionIndex: 0,
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
        }

        // We have obtained the current state, notify component
        const currentState = cache.current;
        setResult(currentState.result);
        if (sortedNamedVersions.length === 0) {
          return;
        }

        let result: IteratorResult<ChangesetStatus[]>;
        while (result = await currentState.changesetStatusIterable.get(), !result.done) {
          // We must avoid modifying the current state cache if component is unmounted
          if (disposed) {
            return;
          }

          const changesets = result.value;
          const numProcessedChangesets = changesets.reduce((acc, curr) => acc + Number(curr.ready), 0);
          const isProcessed = changesets.length === numProcessedChangesets;
          const newEntries = currentState.result.namedVersions.entries.map((entry, index) => {
            if (index === currentState.currentNamedVersionIndex) {
              return {
                version: sortedNamedVersions[currentState.currentNamedVersionIndex].namedVersion,
                state: isProcessed ? VersionProcessedState.Processed : VersionProcessedState.Processing,
                numberNeededChangesets: changesets.length,
                numberProcessedChangesets: numProcessedChangesets,
              };
            }

            if (index > currentState.currentNamedVersionIndex && !isProcessed) {
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

          currentState.currentNamedVersionIndex += 1;
          if (currentState.currentNamedVersionIndex === sortedNamedVersions.length) {
            break;
          }

          void currentState.changesetStatusIterable.next();
        }
      })();

      return () => {
        disposed = true;
        pagedNamedVersionLoaderStateCache = cache.current;
      };
    },
    [],
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

interface SuspendableAsyncIterable<T> {
  /** Returns a promise to the currently awaited iterator value. Starts iteration if it has not been started yet. */
  get(): Promise<IteratorResult<T>>;

  /** Advances the iterator and returns a promise to the next emitted value. */
  next(): Promise<IteratorResult<T>>;
}

/** Decouples iterator advancement and value retrieval. Iteration begins on the first `get` or `next` call. */
function suspendable<T>(iterable: AsyncIterable<T>): SuspendableAsyncIterable<T> {
  const it = iterable[Symbol.asyncIterator]();
  let current: Promise<IteratorResult<T>> | undefined;
  return {
    get: () => (current ??= it.next()),
    next: () => (current = it.next()),
  };
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
            <div className="no-named-versions-message">
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noNamedVersions")}
            </div>
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
    <div className="version-compare-row version-compare-list">
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
        <LoadingSpinner size={SpinnerSize.Medium} />
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
  onViewOpened?: BeEvent<(args?: unknown) => void>;
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

  private async _handleOk(): Promise<void> {
    this.versionSelectComponentRef.current?.startComparison();

    ModalDialogManager.closeDialog();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
  }

  private _handleCancel(): void {
    ModalDialogManager.closeDialog();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
  }

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
        isOpen={true}
        onClose={this._handleCancel.bind(this)}
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
            onClick={this._handleOk.bind(this)}
          >
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}
          </Button>
          <Button onClick={this._handleCancel.bind(this)}>
            {IModelApp.localization.getLocalizedString("UiCore:dialog.cancel")}
          </Button>
        </ModalButtonBar>
      </Modal>
    );
  }
}

/** Show error when we don't have a proper access token from the app to use. */
export const showNotValidAccessTokenError = () => {
  const brief = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.error_invalidToken");
  IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, brief));
};

/**
 * Open the version compare dialog and allow for starting the comparison
 * @param manager VersionCompareManager
 * @param iModel iModel that will be used to find the changesets
 * @param onViewUpdated [optional] event to let version compare UI elements know if visibility of elements/categories/models change from the app
 */
export const openSelectDialog = async (iModel: IModelConnection, onViewUpdated?: BeEvent<(args?: unknown) => void>) => {
  if (iModel.iModelId === undefined || iModel.iTwinId === undefined) {
    throw new Error("openSelectDialogToolButton: IModel is not properly defined");
  }

  const manager = VersionCompare.manager;
  if (manager === undefined) {
    throw new Error(
      "Programmer Error: VersionCompare package must be initialized before using the openSelectDialog function",
    );
  }

  const accessToken = await VersionCompare.getAccessToken();
  if (accessToken === undefined) {
    showNotValidAccessTokenError();
    return;
  }

  ModalDialogManager.openDialog(
    <VersionCompareSelectDialog iModelConnection={iModel} onViewOpened={onViewUpdated} />,
  );
};

/**
 * Tool Button that will open the version compare dialog and allow for starting the comparison.
 * @param manager VersionCompareManager
 * @param iModel iModel that will be used to find the changesets
 * @param onViewUpdated [optional] event to let version compare UI elements know if visibility of
 *                      elements/categories/models change from the app
 */
export const openSelectDialogToolButton = (
  iModel: IModelConnection,
  onViewUpdated?: BeEvent<(args?: unknown) => void>,
) => {
  const onExecute = async () => {
    await openSelectDialog(iModel, onViewUpdated);
  };
  return (
    <ToolButton
      execute={onExecute}
      toolId={"VersionCompareSelectTool"}
      iconSpec="icon-compare"
      labelKey={"VersionCompare:versionCompare.versionCompareBeta"}
    />
  );
};

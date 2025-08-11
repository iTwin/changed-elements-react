/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import {
  SvgChevronLeft, SvgChevronRight, SvgStatusError, SvgStatusSuccess
} from "@itwin/itwinui-icons-react";
import {
  Button, Divider, Flex, ListItem, ProgressRadial, Text, ThemeProvider
} from "@itwin/itwinui-react";
import {
  useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement,
  type ReactNode
} from "react";

import { VersionCompare } from "../api/VersionCompare.js";
import { VersionCompareManager } from "../api/VersionCompareManager.js";
import type { NamedVersion } from "../clients/iModelsClient.js";
import { isAbortError } from "../utils/utils.js";
import { useVersionCompare } from "../VersionCompareContext.js";
import {
  ChangedElementsHeaderButtons, ChangedElementsWidget, LoadingContent
} from "../widgets/ChangedElementsWidget.js";
import {
  runManagerStartComparisonV2
} from "../widgets/comparisonJobWidget/common/versionCompareV2WidgetUtils.js";
import { IconEx } from "./IconEx.js";
import { NamedVersionSelectorContentContext, NamedVersionSelectorContentProps, namedVersionSelectorContext } from "./NamedVersionSelectorContext.js";
import { Sticky } from "./Sticky.js";
import { TextEx } from "./TextEx.js";
import { useComparisonJobs } from "./useComparisonJobs.js";
import {
  useNamedVersionsList, type ComparisonJobStatus, type VersionCompareEntry
} from "./useNamedVersionsList.js";
import { useQueue } from "./useQueue.js";

import { FixedSizeList } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";
import { useResizeObserver } from "../ResizeObserver.js";
import { FeedbackButton } from "../widgets/FeedbackButton.js";
import "./NamedVersionSelector.scss";

interface NamedVersionSelectorWidgetProps {
  iModel: IModelConnection;
  manager?: VersionCompareManager;
  emptyState?: ReactNode;
  manageVersions?: ReactNode;
  feedbackUrl?: string;
  documentationHref?: string;
}

/**
 * By default, displays Named Version selector, but when {@link VersionCompareManager}
 * is actively comparing versions, presents the comparison results.
 * @alpha feature is experimental and may change in future releases.
 */
export function NamedVersionSelectorWidget(props: Readonly<NamedVersionSelectorWidgetProps>): ReactElement {
  const manager = props.manager ?? VersionCompare.manager;
  if (!manager) {
    throw new Error("VersionCompare is not initialized.");
  }

  const { iModel, emptyState, manageVersions, feedbackUrl } = props;
  const [selectedRunningChangesetIndex, setSelectedRunningChangesetIndex] = useState<number | undefined>(undefined);
  const [targetVersion, setTargetVersion] = useState<NamedVersion>();
  const [isComparing, setIsComparing] = useState(manager.isComparing);
  const [isComparisonStarted, setIsComparisonStarted] = useState(manager.isComparisonReady);
  const [disableStartComparison, setDisableStartComparison] = useState(false);
  useEffect(
    () => {
      const cleanup = [
        manager.versionCompareStarting.addListener(() => {
          setIsComparing(true);
        }),
        manager.versionCompareStopped.addListener(() => {
          setIsComparing(false);
          setIsComparisonStarted(false);
        }),
        manager.versionCompareStarted.addListener(() => {
          setIsComparisonStarted(true);
        }),
        manager.versionCompareStartFailed.addListener(() => {
          setIsComparing(false);
          setIsComparisonStarted(false);
        }),
      ];
      return () => cleanup.forEach((cb) => cb());
    },
    [manager],
  );

  const { iModelsClient, comparisonJobClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client is not initialized in given context.");
  }

  if (!iModel.iTwinId || !iModel.iModelId || !iModel.changeset.id) {
    throw new Error("Empty IModel Connection");
  }

  const iTwinId = iModel.iTwinId;
  const iModelId = iModel.iModelId;
  const currentChangesetId = iModel.changeset.id;

  const {
    isLoading,
    currentNamedVersion,
    entries,
    updateJobStatus,
    hasNextPage,
    isNextPageLoading,
    loadNextPage,
  } = useNamedVersionsList({
    iModelId,
    currentChangesetId,
  });

  const widgetRef = useRef<ChangedElementsWidget>(null);

  const onNamedVersionOpened = async (targetVersion?: VersionCompareEntry) => {
    setTargetVersion(targetVersion?.namedVersion);
    if (!targetVersion || !currentNamedVersion || targetVersion.job?.status !== "Completed") {
      return;
    }
    setDisableStartComparison(true);
    await runManagerStartComparisonV2({
      comparisonJob: {
        comparisonJob: {
          status: "Completed",
          jobId: targetVersion.job.jobId,
          iTwinId,
          iModelId,
          startChangesetId: currentChangesetId,
          endChangesetId: targetVersion.namedVersion.targetChangesetId,
          comparison: {
            href: targetVersion.job.comparisonUrl,
          },
        },
      },
      comparisonJobClient,
      iModelConnection: iModel,
      targetVersion: targetVersion.namedVersion,
      currentVersion: currentNamedVersion,
      getToastsEnabled: () => true,
      iModelsClient,
    });
  };

  const stopComparisonCallback = useCallback(async () => {
    setSelectedRunningChangesetIndex(undefined);
    setDisableStartComparison(false);
    setTargetVersion(undefined);
    await manager.stopComparison();
  }, [manager]);


  return (
    <Widget>
      <Widget.Header>
        {isComparisonStarted && <NavigationButton backward onClick={stopComparisonCallback}>
          {t("VersionCompare:versionCompare.versionsList")}
        </NavigationButton>}
        <TextEx variant="title">
          {t("VersionCompare:versionCompare.versionPickerTitle")}
        </TextEx>

        {
          !isComparisonStarted &&
          <ChangedElementsHeaderButtons documentationHref={props.documentationHref} onlyInfo />
        }

        {isComparisonStarted &&
          <div>
            <ChangedElementsHeaderButtons
              useNewNamedVersionSelector
              loaded
              onInspect={() => manager.initializePropertyComparison()}
              onOpenReportDialog={
                manager.wantReportGeneration
                  ? () => void widgetRef.current?.openReportDialog()
                  : undefined
              }
              documentationHref={props.documentationHref}
            />
          </div>}

      </Widget.Header>
      {
        currentNamedVersion &&
        <ActiveVersionsBox current={currentNamedVersion} selected={targetVersion}></ActiveVersionsBox>
      }

      {
        !isComparing &&
        <NamedVersionSelectorContentContext.Provider
          value={{
            iTwinId,
            iModelId,
            isLoading,
            currentNamedVersion,
            entries,
            updateJobStatus,
            onNamedVersionOpened,
            emptyState,
            manageVersions,
            hasNextPage,
            loadNextPage,
            isNextPageLoading,
            disableStartComparison,
            setSelectedRunningChangesetIndex,
            selectedRunningChangesetIndex,
          }}
        >
          <NamedVersionSelectorContent />
          <div className="_cer_v1_feedback_btn_container">
            {feedbackUrl && <FeedbackButton feedbackUrl={feedbackUrl} />}
          </div>
        </NamedVersionSelectorContentContext.Provider>
      }

      {
        isComparing &&
        <namedVersionSelectorContext.Consumer>
          {(value) => (
            <namedVersionSelectorContext.Provider value={{ ...value, contextExists: true }}>
              <ChangedElementsWidget
                ref={widgetRef}
                iModelConnection={iModel}
                manager={manager}
                usingExperimentalSelector
              />
            </namedVersionSelectorContext.Provider>
          )}
        </namedVersionSelectorContext.Consumer>
      }

    </Widget>
  );
}

function EmptyState(): ReactElement {
  return (
    <Text className="_cer_v1_empty-state" isMuted>
      {t("VersionCompare:versionCompare.noPastNamedVersions")}
    </Text>
  );
}

function LoadingState(): ReactElement {
  return (
    <LoadingContent>
      <Text>
        {t("VersionCompare:versionCompare.loadingNamedVersions")}
      </Text>
    </LoadingContent>
  );
}

function NamedVersionSelectorContent(): ReactElement {
  const { isLoading, currentNamedVersion, ...restProps } = useContext(NamedVersionSelectorContentContext);
  if (!isLoading && !restProps.hasNextPage && !restProps.isNextPageLoading && restProps.entries.length === 0) {
    return <EmptyState />;
  }

  if (!currentNamedVersion || isLoading) {
    return <LoadingState />;
  }

  return (
    <NamedVersionSelectorLoaded
      {...restProps}
      currentNamedVersion={currentNamedVersion}
    />
  );
}

interface WidgetProps {
  children?: ReactNode;
}

const Widget = Object.assign(
  WidgetMain,
  {
    Header: WidgetHeader,
  },
);

function WidgetMain(props: Readonly<WidgetProps>): ReactElement {
  return (
    <ThemeProvider style={{ height: "100%" }}>
      <Flex
        className="_cer_v1_version-selector"
        flexDirection="column"
        alignItems="stretch"
        gap="var(--iui-size-m)"
      >
        {props.children}
      </Flex>
    </ThemeProvider>
  );
}

interface WidgetHeaderProps {
  children?: ReactNode;
}

function WidgetHeader(props: Readonly<WidgetHeaderProps>): ReactElement {
  return (
    <div className="_cer_v1_version-selector-header">
      {props.children}
    </div>
  );
}

interface ActiveVersionsBoxProps {
  current: NamedVersion;
  selected?: NamedVersion;
}

function ActiveVersionsBox(props: Readonly<ActiveVersionsBoxProps>): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const dimensions = useResizeObserver(ref);
  const widthBreakpointInPx = 368;
  return (
    <div ref={ref} className={dimensions.width < widthBreakpointInPx ? "_cer_v1_active-versions-box-vertical" : "_cer_v1_active-versions-box-horizontal"}>
      <NamedVersionInfo
        annotation={t("VersionCompare:versionCompare.currentVersionAnnotation")}
        namedVersion={props.current}
      />
      <Divider className={dimensions.width < widthBreakpointInPx ? "_cer_v1_horizontal-divider" : "_cer_v1_vertical-divider"} orientation="horizontal" />
      {
        !props.selected
          ? <PlaceholderNamedVersionInfo />
          : (
            <NamedVersionInfo
              annotation={t("VersionCompare:versionCompare.previousVersion")}
              namedVersion={props.selected}
            />
          )
      }
    </div>
  );
}

interface NamedVersionInfoProps {
  annotation: string;
  namedVersion: NamedVersion;
}

function NamedVersionInfo(props: Readonly<NamedVersionInfoProps>): ReactElement {
  const dateString = useMemo(
    () => props.namedVersion.createdDateTime === "" ? "" : new Date(props.namedVersion.createdDateTime).toLocaleDateString(),
    [props.namedVersion.createdDateTime],
  );

  return (
    <div>
      <Flex gap="var(--iui-size-xs)">
        <TextEx variant="small" weight="normal" oblique>{props.annotation}</TextEx>
        <TextEx variant="small" weight="light" oblique>{dateString}</TextEx>
      </Flex>
      <TextEx variant="body" weight="semibold" overflow="ellipsis">
        {props.namedVersion.displayName}
      </TextEx>
      <TextEx variant="small" overflow="ellipsis">{props.namedVersion.description ?? ""}</TextEx>
    </div>
  );
}

function PlaceholderNamedVersionInfo(): ReactElement {
  return (
    <div className="_cer_v1_placeholder-select-version">
      <TextEx variant="body" weight="normal" isMuted>
        {t("VersionCompare:versionCompare.selectVersionToCompare")}
      </TextEx>
    </div>
  );
}

type LoadedStateProps = Omit<NamedVersionSelectorContentProps, "isLoading" | "currentNamedVersion"> & { currentNamedVersion: NamedVersion; };

function NamedVersionSelectorLoaded(props: LoadedStateProps): ReactElement {
  const {
    iTwinId,
    iModelId,
    currentNamedVersion,
    entries,
    updateJobStatus,
    onNamedVersionOpened,
    manageVersions,
    hasNextPage,
    isNextPageLoading,
    loadNextPage,
    disableStartComparison,
    setSelectedRunningChangesetIndex,
    selectedRunningChangesetIndex,
  } = props;

  const { queryJobStatus, startJob } = useComparisonJobs({
    iTwinId,
    iModelId,
    currentNamedVersion,
    entries,
  });

  const pausedPassiveChecksRef = useRef(new Set<string>());

  const getComparison = useCallback(
    async (entry: VersionCompareEntry, signal?: AbortSignal) => {
      signal?.throwIfAborted();

      if (entry.job?.status === "Completed") {
        return entry.job;
      }

      try {
        pausedPassiveChecksRef.current.add(entry.namedVersion.id);
        if (entry.job?.status === "NotStarted" || entry.job?.status === "Failed") {
          // Optimistically update state for immediate feedback
          updateJobStatus({
            jobId: entry.job.jobId,
            namedVersionId: entry.job.namedVersionId,
            status: "Queued",
          });
        }

        const { job, watchJob } = await startJob(entry.namedVersion, signal);
        let lastJobStatus: ComparisonJobStatus = job;
        for await (const jobStatus of watchJob(5000, signal)) {
          lastJobStatus = jobStatus;
          updateJobStatus(jobStatus);
        }

        return lastJobStatus;
      } finally {
        pausedPassiveChecksRef.current.delete(entry.namedVersion.id);
      }
    },
    [startJob, updateJobStatus],
  );

  const processResults = useCallback(async (target: VersionCompareEntry) => {
    try {
      await getComparison(target);
    } catch (error) {
      if (!isAbortError(error)) {
        // eslint-disable-next-line no-console
        console.error(error);
        updateJobStatus.failed(target.namedVersion);
      }
    }
  }, [getComparison, updateJobStatus]);

  const viewResults = useCallback(async (entry: VersionCompareEntry) => {
    setSelectedRunningChangesetIndex(entry.namedVersion.changesetIndex);
    onNamedVersionOpened(entry);
  }, [onNamedVersionOpened, setSelectedRunningChangesetIndex]);

  const queryStatus = useCallback(
    async (entry: VersionCompareEntry, signal: AbortSignal) => {
      try {
        const job = await queryJobStatus(entry.namedVersion.id, signal);
        // If the job is not found, it means the entry is not loaded yet, this is not an error condition, just wait for the next page to load
        if (!job)
          return;
        updateJobStatus(job);
      } catch (error) {
        if (!isAbortError(error)) {
          // eslint-disable-next-line no-console
          console.error(error);
          if (!signal.aborted) {
            updateJobStatus.failed(entry.namedVersion);
          }
        }
      }
    },
    [queryJobStatus, updateJobStatus],
  );

  const { addItem: initialLoad } = useQueue(queryStatus);
  const { addItem: checkStatus } = useQueue(
    useCallback(
      async (entry: VersionCompareEntry, signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (!pausedPassiveChecksRef.current.has(entry.namedVersion.id)) {
          await queryStatus(entry, signal);
        }
      },
      [queryStatus],
    ),
  );

  const contextValue = useMemo(() => ({
    processResults,
    viewResults,
    initialLoad,
    checkStatus,
    selectedRunningChangesetIndex,
  }), [processResults, viewResults, initialLoad, checkStatus, selectedRunningChangesetIndex]);

  return (
    <NamedVersionInfiniteList
      entries={entries}
      hasNextPage={hasNextPage}
      isNextPageLoading={isNextPageLoading}
      loadNextPage={loadNextPage}
      manageVersions={manageVersions}
      disableStartComparison={disableStartComparison}
      contextValue={contextValue}
      height={600}
      itemHeight={120}
    />
  );
}

interface NamedVersionInfiniteListProps {
  entries: VersionCompareEntry[];
  hasNextPage: boolean;
  isNextPageLoading: boolean;
  loadNextPage: () => Promise<void>;
  manageVersions?: ReactNode;
  contextValue: {
    processResults: (entry: VersionCompareEntry) => Promise<void>;
    viewResults: (entry: VersionCompareEntry) => Promise<void>;
    initialLoad: (entry: VersionCompareEntry) => { cancel: () => void; };
    checkStatus: (entry: VersionCompareEntry) => { cancel: () => void; };
    selectedRunningChangesetIndex?: number;
  };
  height?: number;
  itemHeight?: number;
  disableStartComparison?: boolean;
}

export function NamedVersionInfiniteList({
  entries,
  hasNextPage,
  isNextPageLoading,
  loadNextPage,
  manageVersions,
  disableStartComparison,
  contextValue,
  height = 600,
  itemHeight = 120,
}: NamedVersionInfiniteListProps): ReactElement {

  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = useResizeObserver(containerRef);

  const containerHeight = dimensions.height > 0 ? dimensions.height - 60 : height;
  const containerWidth = dimensions.width > 0 ? dimensions.width : 400;

  // Calculate total item count (entries + loading indicator if needed)
  const itemCount = hasNextPage ? entries.length + 1 : entries.length;

  // Only load more if not already loading
  const loadMoreItems = isNextPageLoading ? async () => { } : loadNextPage;

  // Check if item is loaded (all items loaded except loading indicator)
  const isItemLoaded = (index: number): boolean => {
    return !!entries[index];
  };

  function Item({ index, style }: { index: number; style: React.CSSProperties; }): ReactNode {
    const entry = entries[index];

    if (!entry) {
      return (
        <div style={style} className="_cer_v1_loading-indicator">
          <LoadingContent>
            <TextEx>Loading more versions...</TextEx>
          </LoadingContent>
        </div>
      );
    }
    return (
      <NamedVersionListEntry
        entry={entry}
        style={style}
        containerWidth={containerWidth}
        disableStartComparison={disableStartComparison}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="_cer_v1_named-version-list"
      style={{ height: "100%", width: "100%" }}
    >
      <Sticky className="_cer_v1_named-version-list-header">
        <TextEx variant="small">
          {t("VersionCompare:versionCompare.previousVersions")}
        </TextEx>
        {manageVersions}
      </Sticky>
      <namedVersionSelectorContext.Provider value={contextValue}>
        <InfiniteLoader
          isItemLoaded={isItemLoaded}
          itemCount={itemCount}
          loadMoreItems={loadMoreItems}
          threshold={5}
        >
          {({ onItemsRendered, ref }) => (
            <FixedSizeList
              ref={ref}
              height={containerHeight}
              width="100%"
              itemCount={itemCount}
              itemSize={itemHeight}
              onItemsRendered={onItemsRendered}
              className="_cer_v1_infinite-list"
            >
              {Item}
            </FixedSizeList>
          )}
        </InfiniteLoader>
      </namedVersionSelectorContext.Provider>
    </div>
  );
}

interface NamedVersionEntryProps {
  entry: VersionCompareEntry;
  style?: React.CSSProperties;
  containerWidth?: number;
  disableStartComparison?: boolean;
}

function NamedVersionListEntry(props: Readonly<NamedVersionEntryProps>): ReactElement {
  const { processResults, viewResults, selectedRunningChangesetIndex } = useContext(namedVersionSelectorContext);
  const { namedVersion, job } = props.entry;
  const { containerWidth = 400 } = props;
  const widthBreakpointInPx = 400;
  const dateString = useMemo(
    () => new Date(namedVersion.createdDateTime).toLocaleDateString(),
    [namedVersion.createdDateTime],
  );

  let stateInfo: { status: ReactNode; action: ReactNode; };
  switch (job?.status) {
    case undefined:
      stateInfo = {
        status: <LoadingEntryStatus entry={props.entry} />,
        action: undefined,
      };
      break;

    case "NotStarted":
      stateInfo = {
        status: (
          <Flex>
            <IconEx className="_cer_v1_not-processed" size="m" fill="currentColor">
              <svg viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="8" />
              </svg>
            </IconEx>
            {containerWidth >= widthBreakpointInPx && <TextEx weight="normal" variant="body">
              {t("VersionCompare:versionCompare.notProcessed")}
            </TextEx>}
          </Flex>
        ),
        action: (
          <NavigationButton onClick={() => processResults(props.entry)}>
            {containerWidth >= widthBreakpointInPx ? t("VersionCompare:versionCompare.processResults") : t("VersionCompare:versionCompare.process")}
          </NavigationButton>
        ),
      };
      break;

    case "Queued":
    case "Started":
      stateInfo = {
        status: <ProcessingEntryStatus displayMin={containerWidth <= widthBreakpointInPx} entry={props.entry} />,
        action: (
          <NavigationButton disabled>
            {containerWidth >= widthBreakpointInPx ? t("VersionCompare:versionCompare.viewResults") : t("VersionCompare:versionCompare.view")}
          </NavigationButton>
        ),
      };
      break;

    case "Completed": {
      stateInfo = {
        status: (
          <Flex>
            <IconEx size="m" fill="positive">
              <SvgStatusSuccess />
            </IconEx>
            {containerWidth >= widthBreakpointInPx && !props.disableStartComparison && <TextEx variant="body">
              {t("VersionCompare:versionCompare.available")}
            </TextEx>}
          </Flex>
        ),
        action: (() => {
          if (props.disableStartComparison) {
            // Show spinner only for the currently running comparison
            if (props.entry.namedVersion.changesetIndex === selectedRunningChangesetIndex) {
              return (
                <Flex>
                  <ProgressRadial size="small" indeterminate />
                </Flex>
              );
            }
            return (
              <NavigationButton disabled onClick={() => viewResults(props.entry)}>
                {containerWidth >= widthBreakpointInPx ? t("VersionCompare:versionCompare.viewResults") : t("VersionCompare:versionCompare.view")}
              </NavigationButton>
            );
          }

          return (
            <NavigationButton onClick={() => viewResults(props.entry)}>
              {containerWidth >= widthBreakpointInPx ? t("VersionCompare:versionCompare.viewResults") : t("VersionCompare:versionCompare.view")}
            </NavigationButton>
          );
        })(),
      };
      break;
    }
    case "Failed":
    default:
      stateInfo = {
        status: (
          <Flex>
            <IconEx size="m" fill="negative">
              <SvgStatusError />
            </IconEx>
            {containerWidth >= widthBreakpointInPx &&
              <TextEx weight="normal" variant="body">
                {t("VersionCompare:versionCompare.error")}
              </TextEx>}
          </Flex>
        ),
        action: (
          <NavigationButton onClick={() => processResults(props.entry)}>
            {t("VersionCompare:versionCompare.retry")}
          </NavigationButton>
        ),
      };
      break;
  }

  return (
    <ListItem className="_cer_v1_named-version-entry" style={props.style}>
      <Flex gap="var(--iui-size-m)" alignItems="center" justifyContent="space-between">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gap: "1px" }}>
            <TextEx variant="small" overflow="nowrap" oblique>
              {dateString}
            </TextEx>
            <TextEx variant="body" weight="semibold" overflow="ellipsis">
              {namedVersion.displayName}
            </TextEx>
            <TextEx variant="small" overflow="ellipsis">
              {namedVersion.description ?? ""}
            </TextEx>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--iui-size-s)" }}>
          {stateInfo.status}
          {stateInfo.action}
        </div>
      </Flex>
    </ListItem>
  );
}

interface LoadingEntryStatusProps {
  entry: VersionCompareEntry;
}

function LoadingEntryStatus(props: Readonly<LoadingEntryStatusProps>): ReactElement {
  const { initialLoad } = useContext(namedVersionSelectorContext);
  useEffect(
    () => {
      const { cancel } = initialLoad(props.entry);
      return () => cancel();
    },
    [initialLoad, props.entry],
  );

  return (
    <Flex>
      <ProgressRadial indeterminate />
      {t("VersionCompare:versionCompare.checkingAvailability")}
    </Flex>
  );
}

interface ProcessingEntryStatusProps {
  entry: VersionCompareEntry;
  displayMin?: boolean;
}

function ProcessingEntryStatus(props: Readonly<ProcessingEntryStatusProps>): ReactElement {
  const { job } = props.entry;
  const progress = job?.status === "Started"
    ? Math.floor(100.0 * job.progress.current / (job.progress.max || 1))
    : undefined;

  const { checkStatus } = useContext(namedVersionSelectorContext);
  useEffect(
    () => {
      const { cancel } = checkStatus(props.entry);
      return () => cancel();
    },
    [checkStatus, props.entry],
  );

  if (props.displayMin) {
    return (<Flex>
      <ProgressRadial size="x-small" data-progress={progress} value={progress} >
      </ProgressRadial>
    </Flex>);
  }
  return (
    <Flex>
      <ProgressRadial size="x-small" data-progress={progress} value={progress} />
      {
        progress === undefined
          ? <Text>{t("VersionCompare:versionCompare.processing")}</Text>
          : <Text>{t("VersionCompare:versionCompare.processing")} – {progress}%</Text>
      }
    </Flex>
  );
}

interface ActionButtonProps {
  backward?: boolean;
  disabled?: boolean;
  onClick?: (() => void);
  children: string;
}

function NavigationButton(props: Readonly<ActionButtonProps>): ReactElement {
  return (
    <Button
      className="_cer_v1_action-button"
      styleType="borderless"
      size="large"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Flex gap="var(--iui-size-xs)">
        <IconEx size="m" fill="currentColor">
          {props.backward ? <SvgChevronLeft /> : <SvgChevronRight />}
        </IconEx>
        <TextEx variant="body" weight="normal" >{props.children}</TextEx>
      </Flex>
    </Button>
  );
}

function t(key: string): string {
  return IModelApp.localization.getLocalizedString(key);
}

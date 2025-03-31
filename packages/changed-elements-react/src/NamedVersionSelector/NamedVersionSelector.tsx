/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import {
  SvgChevronLeft, SvgChevronRight, SvgStatusError, SvgStatusSuccess
} from "@itwin/itwinui-icons-react";
import {
  Button, Divider, Flex, List, ListItem, ProgressRadial, Text, ThemeProvider
} from "@itwin/itwinui-react";
import {
  forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement,
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
import { namedVersionSelectorContext } from "./NamedVersionSelectorContext.js";
import { Sticky } from "./Sticky.js";
import { TextEx } from "./TextEx.js";
import { useComparisonJobs } from "./useComparisonJobs.js";
import {
  useNamedVersionsList, type ComparisonJobStatus, type NamedVersionEntry
} from "./useNamedVersionsList.js";
import { useQueue } from "./useQueue.js";

import "./NamedVersionSelector.scss";
import { FeedbackButton } from "../widgets/FeedbackButton.js";

interface NamedVersionSelectorWidgetProps {
  iModel: IModelConnection;
  manager?: VersionCompareManager | undefined;
  emptyState?: ReactNode | undefined;
  manageVersions?: ReactNode | undefined;
  feedbackUrl?: string | undefined;
}

// todo move this to a separate file
export type ReactComponentLifeCycle = "mounted" | "unmounted";

/**
 * By default, displays Named Version selector, but when {@link VersionCompareManager}
 * is actively comparing versions, presents the comparison results.
 * @alpha feature is experimental and may change in future releases.
 */
export function NamedVersionSelectorWidget(props: NamedVersionSelectorWidgetProps): ReactElement {
  const manager = props.manager ?? VersionCompare.manager;
  if (!manager) {
    throw new Error("VersionCompare is not initialized.");
  }

  const { iModel, emptyState, manageVersions , feedbackUrl } = props;

  const [isComparing, setIsComparing] = useState(manager.isComparing);
  const [isComparisonStarted, setIsComparisonStarted] = useState(manager.isComparisonReady);
  const [changedElementsWidgetLifeCycle, setChangedElementsWidgetLifeCycle] = useState<ReactComponentLifeCycle>("unmounted");
  const handleLifecycleChange = (lifeCycleState: ReactComponentLifeCycle) => {
    setChangedElementsWidgetLifeCycle(lifeCycleState);
  };
  
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
      ];
      return () => cleanup.forEach((cb) => cb());
    },
    [manager],
  );

  const widgetRef = useRef<ChangedElementsWidget>(null);

  if (!isComparing) {
    return (
        <NamedVersionSelector
          iModel={iModel}
          manager={manager}
          emptyState={emptyState}
          manageVersions={manageVersions}
          feedbackUrl={feedbackUrl}
          canStartComparison={changedElementsWidgetLifeCycle === "unmounted"}
        />
    );
  }

  return (
    <Widget>
      <Widget.Header>
        <NavigationButton disabled={ changedElementsWidgetLifeCycle !== "mounted"} backward onClick={() => manager.stopComparison()}>
          {t("VersionCompare:versionCompare.versionsList")}
        </NavigationButton>
        <TextEx variant="title">
          {t("VersionCompare:versionCompare.versionPickerTitle")}
        </TextEx>
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
          />
        </div>
      </Widget.Header>
      <namedVersionSelectorContext.Consumer>
        {(value) => (
          <namedVersionSelectorContext.Provider value={{ ...value, contextExists: true }}>
            {props.manager?.currentVersion && isComparisonStarted &&
              <ActiveVersionsBox current={props.manager?.currentVersion} selected={props.manager?.targetVersion}></ActiveVersionsBox>}
            <ChangedElementsWidget
              ref={widgetRef}
              iModelConnection={iModel}
              manager={manager}
              usingExperimentalSelector
              onLifeCycleChange={handleLifecycleChange}
            />
          </namedVersionSelectorContext.Provider>
        )}
      </namedVersionSelectorContext.Consumer>
    </Widget>
  );
}

interface NamedVersionSelectorProps {
  iModel: IModelConnection;
  manager: VersionCompareManager;
  emptyState?: ReactNode | undefined;
  manageVersions?: ReactNode | undefined;
  feedbackUrl?: string | undefined;
  canStartComparison: boolean;
}

function NamedVersionSelector(props: NamedVersionSelectorProps): ReactElement {
  const { iModelsClient, comparisonJobClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client is not initialized in given context.");
  }

  const { iModel, manager, emptyState, manageVersions, feedbackUrl } = props;

  const iTwinId = iModel.iTwinId as string;
  const iModelId = iModel.iModelId as string;
  const currentChangesetId = iModel.changeset.id;

  const { isLoading, currentNamedVersion, entries, updateJobStatus } = useNamedVersionsList({
    iTwinId,
    iModelId,
    currentChangesetId,
  });

  const [openedVersion, setOpenedVersion] = useState(manager.targetVersion);
  const handleVersionOpened = async (targetVersion: NamedVersionEntry | undefined) => {
    setOpenedVersion(targetVersion?.namedVersion);
    if (!targetVersion || !currentNamedVersion || targetVersion.job?.status !== "Completed") {
      return;
    }

    await runManagerStartComparisonV2({
      comparisonJob: {
        comparisonJob: {
          status: "Completed",
          jobId: targetVersion.job.jobId,
          iTwinId,
          iModelId,
          startChangesetId: currentChangesetId,
          endChangesetId: targetVersion.namedVersion.targetChangesetId ?? "",
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
    manager.versionCompareStopped.addOnce(() => setOpenedVersion(undefined));
  };

  return (
    <Widget>
      <Widget.Header>
        <TextEx variant="title">
          {t("VersionCompare:versionCompare.versionPickerTitle")}
        </TextEx>
        {currentNamedVersion && <ChangedElementsHeaderButtons onlyInfo />}
      </Widget.Header>
      {
        currentNamedVersion &&
        <ActiveVersionsBox current={currentNamedVersion} selected={openedVersion} />
      }
      {
        (!isLoading && entries.length === 0)?
          <Text className="_cer_v1_empty-state" isMuted>
            {t("VersionCompare:versionCompare.noPastNamedVersions")}
          </Text>
          :
        (!currentNamedVersion || (isLoading && entries.length === 0))
          ? (
            <LoadingContent>
              <Text>
                {t("VersionCompare:versionCompare.loadingNamedVersions")}
              </Text>
            </LoadingContent>
          )
          : (
            <NamedVersionSelectorLoaded
              iTwinId={iTwinId}
              iModelId={iModelId}
              currentNamedVersion={currentNamedVersion}
              isLoading={isLoading}
              entries={entries}
              onNamedVersionOpened={handleVersionOpened}
              updateJobStatus={updateJobStatus}
              emptyState={emptyState}
              manageVersions={manageVersions}
              canStartComparison={props.canStartComparison}
            />
          )
      }
      <div className="_cer_v1_feedback_btn_container">
        {feedbackUrl && <FeedbackButton feedbackUrl={feedbackUrl} />}
      </div>
    </Widget>
  );
}

interface WidgetProps {
  children?: ReactNode | undefined;
}

const Widget = Object.assign(
  WidgetMain,
  {
    Header: WidgetHeader,
  },
);

function WidgetMain(props: WidgetProps): ReactElement {
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
  children?: ReactNode | undefined;
}

function WidgetHeader(props: WidgetHeaderProps): ReactElement {
  return (
    <div className="_cer_v1_version-selector-header">
      {props.children}
    </div>
  );
}

interface ActiveVersionsBoxProps {
  current: NamedVersion;
  selected?: NamedVersion | undefined;
}

function ActiveVersionsBox(props: ActiveVersionsBoxProps): ReactElement {
  return (
    <div className="_cer_v1_active-versions-box">
      <NamedVersionInfo
        annotation={t("VersionCompare:versionCompare.currentVersionAnnotation")}
        namedVersion={props.current}
      />
      <Divider className="_cer_v1_vertical-divider" orientation="vertical" />
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

function NamedVersionInfo(props: NamedVersionInfoProps): ReactElement {
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

interface NamedVersionSelectorLoadedProps {
  iTwinId: string;
  iModelId: string;
  currentNamedVersion: NamedVersion;
  isLoading: boolean;
  entries: NamedVersionEntry[];
  updateJobStatus: ReturnType<typeof useNamedVersionsList>["updateJobStatus"];
  onNamedVersionOpened: (version: NamedVersionEntry) => void;
  emptyState?: ReactNode | undefined;
  manageVersions?: ReactNode | undefined;
  canStartComparison: boolean;
}

function NamedVersionSelectorLoaded(props: NamedVersionSelectorLoadedProps): ReactElement {
  const {
    iTwinId,
    iModelId,
    currentNamedVersion,
    entries,
    updateJobStatus,
    onNamedVersionOpened,
    manageVersions,
  } = props;

  const { queryJobStatus, startJob } = useComparisonJobs({
    iTwinId,
    iModelId,
    currentNamedVersion,
    entries,
  });

  const pausedPassiveChecksRef = useRef(new Set<string>());

  const getComparison = useCallback(
    async (entry: NamedVersionEntry, signal?: AbortSignal) => {
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

  const processResults = async (target: NamedVersionEntry) => {
    try {
      await getComparison(target);
    } catch (error) {
      if (!isAbortError(error)) {
        // eslint-disable-next-line no-console
        console.error(error);
        updateJobStatus.failed(target.namedVersion);
      }
    }
  };

  const viewResults = async (entry: NamedVersionEntry) => {
    onNamedVersionOpened(entry);
  };

  const queryStatus = useCallback(
    async (entry: NamedVersionEntry, signal: AbortSignal) => {
      try {
        const job = await queryJobStatus(entry.namedVersion.id, signal);
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
      async (entry: NamedVersionEntry, signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (!pausedPassiveChecksRef.current.has(entry.namedVersion.id)) {
          await queryStatus(entry, signal);
        }
      },
      [queryStatus],
    ),
  );

  return (
      <List className="_cer_v1_named-version-list">
        <Sticky className="_cer_v1_named-version-list-header">
          <TextEx variant="small">
            {t("VersionCompare:versionCompare.previousVersions")}
          </TextEx>
          {manageVersions}
        </Sticky>
        <namedVersionSelectorContext.Provider
          value={{ processResults, viewResults, initialLoad, checkStatus }}
        >
          {
            props.entries.map((entry) => (
              <NamedVersionListEntry canStartComparison={props.canStartComparison} key={entry.namedVersion.id} entry={entry} />
            ))
          }
        </namedVersionSelectorContext.Provider>
      </List>
  );
}

interface NamedVersionEntryProps {
  entry: NamedVersionEntry;
  canStartComparison: boolean;
}

const NamedVersionListEntry = forwardRef<HTMLDivElement, NamedVersionEntryProps>(
  function NamedVersionListEntry(props, ref): ReactElement {
    const { processResults, viewResults } = useContext(namedVersionSelectorContext);
    const { namedVersion, job } = props.entry;

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
              <TextEx weight="normal" variant="body">
                {t("VersionCompare:versionCompare.notProcessed")}
              </TextEx>
            </Flex>
          ),
          action: (
            <NavigationButton onClick={() => processResults(props.entry)}>
              {t("VersionCompare:versionCompare.processResults")}
            </NavigationButton>
          ),
        };
        break;

      case "Queued":
      case "Started":
        {
          stateInfo = {
            status: <ProcessingEntryStatus entry={props.entry} />,
            action: <NavigationButton disabled>
              {t("VersionCompare:versionCompare.viewResults")}
            </NavigationButton>,
          };
        }
        break;

      case "Completed":
        stateInfo = {
          status: (
            <Flex>
              <IconEx size="m" fill="positive">
                <SvgStatusSuccess />
              </IconEx>
              <TextEx variant="body">
                {t("VersionCompare:versionCompare.available")}
              </TextEx>
            </Flex>
          ),
          action: (
            <NavigationButton disabled={!props.canStartComparison} onClick={() => viewResults(props.entry)}>
              {t("VersionCompare:versionCompare.viewResults")}
            </NavigationButton>
          ),
        };
        break;

      case "Failed":
      default:
        stateInfo = {
          status: (
            <Flex>
              <IconEx size="m" fill="negative" >
                <SvgStatusError />
              </IconEx>
              <TextEx weight="normal" variant="body">
                {t("VersionCompare:versionCompare.error")}
              </TextEx>
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

    const dateString = useMemo(
      () => new Date(namedVersion.createdDateTime).toLocaleDateString(),
      [namedVersion.createdDateTime],
    );

    return (
      <ListItem ref={ref} className="_cer_v1_named-version-entry">
        <div>
          <div style={{ display: "grid", gap: "1px" }}>
            <TextEx variant="small" overflow="nowrap" oblique>{dateString}</TextEx>
            <TextEx variant="body" weight="semibold" overflow="ellipsis">
              {namedVersion.displayName}
            </TextEx>
            <TextEx variant="small" overflow="ellipsis">{namedVersion.description ?? ""}</TextEx>
          </div>
        </div>
        {stateInfo.status}
        {stateInfo.action}
      </ListItem>
    );
  },
);

interface LoadingEntryStatusProps {
  entry: NamedVersionEntry;
}

function LoadingEntryStatus(props: LoadingEntryStatusProps): ReactElement {
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
  entry: NamedVersionEntry;
}

function ProcessingEntryStatus(props: ProcessingEntryStatusProps): ReactElement {
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

  return (
    <Flex>
      <ProgressRadial data-progress={progress} value={progress} />
      {
        progress === undefined
          ? <Text>{t("VersionCompare:versionCompare.processing")}</Text>
          : <Text>{t("VersionCompare:versionCompare.processing")} – {progress}%</Text>
      }
    </Flex>
  );
}

interface ActionButtonProps {
  backward?: boolean | undefined;
  disabled?: boolean | undefined;
  onClick?: (() => void) | undefined;
  children: string;
}

function NavigationButton(props: ActionButtonProps): ReactElement {
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

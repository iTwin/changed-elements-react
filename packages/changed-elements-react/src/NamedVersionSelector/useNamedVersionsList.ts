/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { useEffect, useMemo, useState } from "react";

import type { IModelsClient, NamedVersion } from "../clients/iModelsClient.js";
import { isAbortError } from "../utils/utils.js";
import { useVersionCompare } from "../VersionCompareContext.js";

export interface NamedVersionEntry {
  namedVersion: NamedVersion & { targetChangesetId: string; };
  job: ComparisonJobStatus | undefined;
}

export type ComparisonJobStatus = {
  jobId: string;
  namedVersionId: string;
} & (
    { status: "NotStarted"; } |
    { status: "Queued"; } |
    {
      status: "Started";
      progress: { current: number; max: number; };
    } |
    {
      status: "Completed";
      comparisonUrl: string;
    } |
    {
      status: "Failed";
      errorDetails: string;
    }
  );

interface UseNamedVersionListArgs {
  iTwinId: string;
  iModelId: string;
  currentChangesetId: string;
}

interface UseNamedVersionListResult {
  /** True while Named Version list is still being appended. */
  isLoading: boolean;

  /** True when an error encountered. {@linkcode isLoading} is `false` in this state. */
  isError: boolean;

  /**
   * Returned as `undefined` initially while being asynchronously retrieved based
   * on the `currentChangesetId` prop.
   */
  currentNamedVersion: NamedVersion | undefined;

  /** Currently known {@link NamedVersions} that are older than `currentChangesetId`. */
  entries: NamedVersionEntry[];

  /**
   * Allows updating job status of associated {@link NamedVersion}. When an error
   * occurs, you won't necessarily have a job object you can supply, in which case
   * use `updateJobStatus.failed(namedVersion)` to set the status to `"Failed"`.
   */
  updateJobStatus: {
    (job: ComparisonJobStatus): void;
    failed: (namedVersion: NamedVersion) => void;
  };
}

/**
 * Downloads information about available and current Named Versions. The Named Version
 * list is sorted in reverse chronological order and incrementally updated as new
 * Named Version pages are loaded.
 */
export function useNamedVersionsList(args: UseNamedVersionListArgs): UseNamedVersionListResult {
  const { iTwinId, iModelId, currentChangesetId } = args;
  const { iModelsClient } = useVersionCompare();
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [currentNamedVersion, setCurrentNamedVersion] = useState<NamedVersion>();
  const [entries, setEntries] = useState<NamedVersionEntry[]>([]);

  const updateJobStatus = useMemo(
    () => Object.assign(
      (job: ComparisonJobStatus) => {
        setEntries(
          (prev) => prev.map(
            (entry) => entry.namedVersion.id === job.namedVersionId
              ? { namedVersion: entry.namedVersion, job }
              : entry,
          ),
        );
      },
      {
        failed: (namedVersion: NamedVersion) => {
          setEntries(
            (prev) => prev.map(
              (entry) => entry.namedVersion.id === namedVersion.id
                ? {
                  namedVersion: entry.namedVersion,
                  job: {
                    jobId: "",
                    namedVersionId: entry.namedVersion.id,
                    status: "Failed",
                    errorDetails: "Error",
                  },
                }
                : entry,
            ),
          );
        },
      },
    ),
    [],
  );

  useEffect(
    () => {
      const abortController = new AbortController();
      setIsLoading(true);
      setIsError(false);
      setEntries([]);

      void (async () => {
        try {
          abortController.signal.throwIfAborted();
          // Slow! This loads all Changesets [0 -> Inf) but we'll only use [currentChangeset -> 0].
          // We don't need the early Changesets yet because they represent the oldest
          // Named Versions which will most likely appear below the fold.
          const changesets = await iModelsClient.getChangesets({
            iModelId,
            signal: abortController.signal,
          });
          abortController.signal.throwIfAborted();

          // Discard all future Changesets relative to the current Changeset
          const currentChangesetArrayIndex = changesets.findIndex(
            ({ id }) => id === currentChangesetId,
          );
          if (currentChangesetArrayIndex === -1) {
            setIsLoading(false);
            setIsError(true);
            setCurrentNamedVersion({
              id: "error",
              displayName: IModelApp.localization.getLocalizedString(
                "VersionCompare:versionCompare.namedVersionErrorPlaceholder",
              ),
              changesetId: currentChangesetId,
              changesetIndex: -1,
              description: IModelApp.localization.getLocalizedString(
                "VersionCompare:versionCompare.noNamedVersions",
              ),
              createdDateTime: "",
            });
            return;
          }

          changesets.splice(currentChangesetArrayIndex + 1);

          // We'll be looking at the most recent Named Versions first thus order
          // Changesets from current to oldest; highest index to lowest.

          changesets.reverse();
          const currentChangeset = changesets[0];
          let currentNamedVersion: NamedVersion | undefined = undefined;
          let seekHead = 1;

          const iterator = loadNamedVersions(iModelsClient, iModelId, abortController.signal);
          for await (const page of iterator) {
            // Skip pages that are newer than the currentChangeset. We'll always
            // find the oldest (smallest) Changeset index at the back of the page.
            if (currentChangeset.index < page[page.length - 1].changesetIndex) {
              continue;
            }

            // According to the Intermediate Value Theorem, we must have crossed
            // the current Named Version in between the start and the end of current
            // page. If we can't find it here, we'll assume currentChangeset exists
            // at its declared index but doesn't have a Named Version pointing at it.

            const entries: NamedVersionEntry[] = [];

            for (let i = 0; i < page.length; ++i) {
              const namedVersion = page[i];

              if (!currentNamedVersion) {
                if (currentChangeset.index < namedVersion.changesetIndex) {
                  continue;
                }

                if (namedVersion.changesetId === currentChangeset.id) {
                  currentNamedVersion = namedVersion;
                  setCurrentNamedVersion(namedVersion);
                  continue;
                }

                currentNamedVersion = {
                  id: currentChangeset.id,
                  displayName: IModelApp.localization.getLocalizedString(
                    "VersionCompare:versionCompare.currentChangeset",
                  ),
                  changesetId: currentChangeset.id,
                  changesetIndex: currentChangeset.index,
                  description: currentChangeset.description,
                  createdDateTime: currentChangeset.pushDateTime,
                };
                setCurrentNamedVersion(currentNamedVersion);
              }

              // Changed Elements service asks for a changeset range to operate
              // on. Because user expects to see changes made since the selected
              // NamedVersion, we need to find the first Changeset that follows
              // the target NamedVersion.
              const recoveryPosition = seekHead;
              while (
                seekHead < changesets.length && namedVersion.changesetIndex < changesets[seekHead].index
              ) {
                seekHead += 1;
              }

              if (changesets[seekHead].id !== namedVersion.changesetId) {
                // We didn't find the Changeset that this Named Version is based
                // on. UI should mark this Named Version as invalid but that's not
                // yet implemented.
                seekHead = recoveryPosition;
                continue;
              }

              entries.push({
                namedVersion: {
                  ...namedVersion,
                  targetChangesetId: changesets[seekHead - 1].id,
                },
                job: undefined,
              });
            }

            setEntries((prev) => prev.concat(entries));
          }

          setIsLoading(false);
        } catch (error) {
          if (!isAbortError(error)) {
            // eslint-disable-next-line no-console
            console.error(error);
            setIsLoading(false);
            setIsError(true);
          }
        }
      })();
      return () => {
        abortController.abort();
      };
    },
    [iModelsClient, iTwinId, iModelId, currentChangesetId],
  );

  return {
    isLoading,
    isError,
    currentNamedVersion,
    entries,
    updateJobStatus,
  };
}

/** Returns pages of Named Versions in reverse chronological order. */
async function* loadNamedVersions(
  iModelsClient: IModelsClient,
  iModelId: string,
  signal: AbortSignal,
): AsyncGenerator<NamedVersion[]> {
  signal.throwIfAborted();

  const pageSize = 20;
  let skip = 0;

  while (true) {
    const namedVersions = await iModelsClient.getNamedVersions({
      iModelId,
      top: pageSize,
      skip,
      orderby: "changesetIndex",
      ascendingOrDescending: "desc",
      signal,
    });
    signal.throwIfAborted();

    if (namedVersions.length === 0) {
      return;
    }

    skip += namedVersions.length;
    yield namedVersions;
  }
}

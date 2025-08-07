/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { NamedVersion, Changeset } from "../clients/iModelsClient.js";
import { isAbortError } from "../utils/utils.js";
import { useVersionCompare } from "../VersionCompareContext.js";

export interface NamedVersionEntry {
  namedVersion: NamedVersion;
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
  hasNextPage: boolean;
  loadNextPage: () => Promise<void>;
  isNextPageLoading: boolean;
}

/**
 * Downloads information about available and current Named Versions. The Named Version
 * list is sorted in reverse chronological order and incrementally updated as new
 * Named Version pages are loaded.
 */
export function useNamedVersionsList(args: UseNamedVersionListArgs): UseNamedVersionListResult {
  const { iModelId, currentChangesetId } = args;
  const { iModelsClient } = useVersionCompare();
  const [loadingInitNamedVersion, setLoadingInitNamedVersion] = useState(true);
  const [isError, setIsError] = useState(false);
  const [currentNamedVersion, setCurrentNamedVersion] = useState<NamedVersion>();
  const [allNamedVersions, setAllNamedVersions] = useState<NamedVersion[]>([]);
  const [currentChangeset, setCurrentChangeset] = useState<Changeset>();
  const [entries, setEntries] = useState<NamedVersionEntry[]>([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const pageSize = 20;
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

  // Initial load - get current changeset and first page
  useEffect(() => {
    let disposed = false;

    const loadInitial = async () => {
      setLoadingInitNamedVersion(true);
      setIsError(false);

      try {
        const changeset = await iModelsClient.getChangeset({
          iModelId,
          changesetId: currentChangesetId,
        });

        if (disposed) return;

        if (!changeset) {
          setIsError(true);
          return;
        }

        setCurrentChangeset(changeset);
        setCurrentNamedVersion(getOrCreateCurrentNamedVersion(allNamedVersions, changeset));
        // Reset pagination
        setCurrentPage(0);
        setEntries([]);
        setHasNextPage(true);
      } catch (error) {
        if (!disposed && !isAbortError(error)) {
          setIsError(true);
        }
      } finally {
        if (!disposed) {
          setLoadingInitNamedVersion(false);
        }
      }
    };

    void loadInitial();

    return () => {
      disposed = true;
    };
  }, [iModelsClient, iModelId, currentChangesetId]);


  const loadNextPage = useCallback(
    async () => {
      if (isNextPageLoading || !hasNextPage || !currentChangeset) {
        return;
      }

      setIsNextPageLoading(true);

      try {
        const namedVersions = await iModelsClient.getNamedVersions({
          iModelId,
          top: pageSize,
          skip: currentPage * pageSize,
          orderby: "changesetIndex",
          ascendingOrDescending: "desc",
        });

        if (namedVersions.length === 0) {
          setHasNextPage(false);
          return;
        }
        const updatedAllNamedVersions = allNamedVersions.concat(namedVersions);
        setAllNamedVersions(updatedAllNamedVersions);

        // Filter to only versions older than current
        const relevantVersions = namedVersions.filter(
          nv => nv.changesetIndex < currentChangeset.index,
        );

        // Process changeset promises...
        const changesetPromises = relevantVersions.map(async (namedVersion) => {
          const offsetChangesetIndex = (namedVersion.changesetIndex + 1).toString();
          const changeSet = await iModelsClient.getChangeset({
            iModelId: iModelId,
            changesetId: offsetChangesetIndex,
          });
          namedVersion.changesetId = changeSet?.id ?? namedVersion.changesetId;
          return { namedVersion, changeSet, offsetChangesetIndex };
        });

        const results = await Promise.allSettled(changesetPromises);

        // Process results
        const pageEntries: NamedVersionEntry[] = [];
        results.forEach((result, index) => {
          if (result.status === "fulfilled" && result.value.changeSet) {
            pageEntries.push({
              namedVersion: {
                ...result.value.namedVersion,
              },
              job: undefined,
            });
          } else {
            const namedVersion = relevantVersions[index];
            console.warn(`Could not fetch target changeset for named version ${namedVersion.displayName}`);
          }
        });

        // Add to entries if we have any
        if (pageEntries.length > 0) {
          setEntries(prev => prev.concat(pageEntries));
        }

        setCurrentPage(prev => prev + 1);
        setHasNextPage(namedVersions.length === pageSize); // ✅ Fixed
        if (!currentNamedVersion) {
          const currentNamedVersionFound = getOrCreateCurrentNamedVersion(
            updatedAllNamedVersions,
            currentChangeset,
          );
          setCurrentNamedVersion(currentNamedVersionFound);
        }

        // Set current named version if not found yet
        if (currentNamedVersion && isEqualToSyntheticNamedVersion(currentNamedVersion, currentChangeset)) {
          const currentNamedVersionFound = getOrCreateCurrentNamedVersion(
            updatedAllNamedVersions,
            currentChangeset,
          );
          setCurrentNamedVersion(currentNamedVersionFound);
        }

      } catch (error) {
        if (!isAbortError(error)) {
          setIsError(true);
        }
      } finally {
        setIsNextPageLoading(false);
      }
    },
    [isNextPageLoading, hasNextPage, currentChangeset, iModelsClient, iModelId, currentPage, allNamedVersions, currentNamedVersion]
  );

  return {
    isLoading: loadingInitNamedVersion,
    isError,
    currentNamedVersion,
    entries,
    updateJobStatus,
    hasNextPage,
    isNextPageLoading,
    loadNextPage,
  };
}

function getOrCreateCurrentNamedVersion(
  namedVersions: NamedVersion[],
  currentChangeset: Changeset,
): NamedVersion {
  // Check if current changeset has a named version
  const existingNamedVersion = namedVersions.find(
    nv => nv.changesetId === currentChangeset.id || nv.changesetIndex === currentChangeset.index,
  );

  if (existingNamedVersion) {
    return existingNamedVersion;
  }

  // Create synthetic named version for current changeset
  return {
    id: currentChangeset.id,
    displayName: IModelApp.localization.getLocalizedString(
      "VersionCompare:versionCompare.currentChangeset",
    ),
    changesetId: currentChangeset.id,
    changesetIndex: currentChangeset.index,
    description: currentChangeset.description || "",
    createdDateTime: currentChangeset.pushDateTime || new Date().toISOString(),
  };
}

function isEqualToSyntheticNamedVersion(
  namedVersion: NamedVersion,
  currentChangeset: Changeset): boolean {
  for (const key of Object.keys(namedVersion) as (keyof NamedVersion)[]) {
    if (key === "displayName") {
      continue;
    }
    if (key === "createdDateTime") {
      const changesetTime = currentChangeset.pushDateTime ?
        new Date(currentChangeset.pushDateTime).getTime() : 0;
      const namedVersionTime = namedVersion.createdDateTime ?
        new Date(namedVersion.createdDateTime).getTime() : 0;
      // If createdDateTime is not equal, then it's not the same named version
      if (namedVersionTime !== changesetTime) {
        return false;
      }
      continue;
    }
    if (!(key in currentChangeset)) {
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (namedVersion[key] !== (currentChangeset as any)[key]) {
      return false;
    }
  }
  return true;
}

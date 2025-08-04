/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { useEffect, useMemo, useState } from "react";

import type { NamedVersion, Changeset } from "../clients/iModelsClient.js";
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
      let disposed = false;

      setIsLoading(true);
      setIsError(false);
      setEntries([]);
      setCurrentNamedVersion(undefined);

      void (async () => {
        try {
          // First, get the current changeset to establish our baseline
          const currentChangeset = await iModelsClient.getChangeset({
            iModelId,
            changesetId: currentChangesetId,
          });
          const allNamedVersions: NamedVersion[] = [];
          if (disposed) return;

          if (!currentChangeset) {
            setIsError(true);
            setIsLoading(false);
            return;
          }

          let currentNamedVersionFound: NamedVersion | undefined;
          let currentPage = 0;
          const pageSize = 20;

          // Load Named Versions in pages
          while (!disposed) {
            const namedVersions = await iModelsClient.getNamedVersions({
              iModelId,
              top: pageSize,
              skip: currentPage * pageSize,
              orderby: "changesetIndex",
              ascendingOrDescending: "desc",
            });
            allNamedVersions.push(...namedVersions);
            if (disposed) return;

            // If no more results, we're done
            if (namedVersions.length === 0) {
              break;
            }
            // Filter to only versions older than current
            const relevantVersions = namedVersions.filter(
              nv => nv.changesetIndex < currentChangeset.index,
            );

            // Process this page of named versions with Promise.allSettled for better error handling
            const changesetPromises = relevantVersions.map(async (namedVersion) => {
              const offsetChangesetIndex = (namedVersion.changesetIndex + 1).toString();

              const changeSet = await iModelsClient.getChangeset({
                iModelId: iModelId,
                changesetId: offsetChangesetIndex,
              });

              return {
                namedVersion,
                changeSet,
                offsetChangesetIndex,
              };
            });

            // Execute all in parallel with individual error handling
            const results = await Promise.allSettled(changesetPromises);

            // Process results
            const pageEntries: NamedVersionEntry[] = [];
            results.forEach((result, index) => {
              if (result.status === "fulfilled" && result.value.changeSet) {
                pageEntries.push({
                  namedVersion: {
                    ...result.value.namedVersion,
                    targetChangesetId: result.value.changeSet.id,
                  },
                  job: undefined,
                });
              } else {
                const namedVersion = relevantVersions[index];
                // eslint-disable-next-line no-console
                console.warn(`Could not fetch target changeset for named version ${namedVersion.displayName}`);
              }
            });

            if (disposed) return;

            // Add to entries if we have any
            if (pageEntries.length > 0) {
              setEntries(prev => prev.concat(pageEntries));
            }

            // If we got fewer results than page size, we're done
            if (namedVersions.length < pageSize) {
              break;
            }

            currentPage++;
          }
          // Set current named version if not found yet
          if (!currentNamedVersionFound) {
            currentNamedVersionFound = getOrCreateCurrentNamedVersion(
              allNamedVersions,
              currentChangeset,
            );
            if (disposed) return;
            setCurrentNamedVersion(currentNamedVersionFound);
          }
        } catch (error) {
          if (!disposed && !isAbortError(error)) {
            setIsError(true);
          }
        } finally {
          if (!disposed) {
            setIsLoading(false);
          }
        }
      })();

      return () => {
        disposed = true;
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

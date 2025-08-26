/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Changeset, IModelsClient, NamedVersion } from "../clients/iModelsClient.js";
import { isAbortError } from "../utils/utils.js";
import { useVersionCompare } from "../VersionCompareContext.js";

/**
 * A named version extended with the target changeset ID for comparison operations.
 * The targetChangesetId represents the offset changeset that should be used when
 * performing version comparisons, as the original changeset is "already applied"
 * to the named version according to the Changed Elements API.
 *
 * @see https://developer.bentley.com/tutorials/changed-elements-api/#221-using-the-api-to-get-changed-elements
 */
export type NamedVersionWithTarget = NamedVersion & { targetChangesetId: string; };

/**
 * Represents a named version entry with its associated comparison job status.
 * This interface combines a named version with an optional comparison job to track
 * the processing state of version comparisons.
 */
export interface VersionCompareEntry {
  /**
   * The named version information extended with the target changeset ID.
   * The targetChangesetId represents the offset changeset that should be used
   * for comparison operations, as the changeset is "already applied" to the named version.
   */
  namedVersion: NamedVersionWithTarget;

  /**
   * The current status of the comparison job for this named version.
   * Will be undefined when no comparison has been initiated yet.
   */
  job: ComparisonJobStatus | undefined;
}

/**
 * CurrentNamedVersion for the iModel.
 * The current named version may not exist or has not been paged yet.
 * So we might create a synthetic version based on the current changeset, until we query the current named version or we know it can not be found.
 */
export type CurrentNamedVersion = NamedVersion & { isSynthetic: boolean; };

/**
 * Holds information related to the Comparison Job
 * A job can either be `NotStarted` `Queued` `Started` `Complete` or `Failed`
 */
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
  /** Current iModel. */
  iModelId: string;
  /** Current changeset belonging to iModel. */
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
  entries: VersionCompareEntry[];

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
 *
 * @param args - Configuration object containing iModelId and currentChangesetId
 * @returns Hook result containing loading state, entries, and pagination controls
 */
export function useNamedVersionsList(args: UseNamedVersionListArgs): UseNamedVersionListResult {
  const { iModelId, currentChangesetId } = args;
  const { iModelsClient } = useVersionCompare();
  const [loadingInitNamedVersion, setLoadingInitNamedVersion] = useState(true);
  const [isError, setIsError] = useState(false);
  const [currentNamedVersion, setCurrentNamedVersion] = useState<CurrentNamedVersion>();
  const [currentChangeset, setCurrentChangeset] = useState<Changeset>();
  const [entries, setEntries] = useState<VersionCompareEntry[]>([]);

  const [currentPage, setCurrentPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
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

        // Reset pagination and entries
        setCurrentPage(0);
        setEntries([]);
        setHasNextPage(true);

        // Always create/update current named version when changeset changes.
        // Before we page, ensure current named version is set. It will be set as a synthetic version and updated later.
        const currentNV = getOrCreateCurrentNamedVersion([], changeset);
        setCurrentNamedVersion(currentNV);
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
      const pageSize = 20;
      if (isNextPageLoading || !hasNextPage || !currentChangeset) {
        return;
      }

      setIsNextPageLoading(true);

      try {
        // Fetch page of named versions and update current version if needed
        const { namedVersions, shouldContinue } = await fetchNamedVersionsPage(
          iModelsClient,
          iModelId,
          currentPage,
          pageSize,
          currentNamedVersion,
          currentChangeset,
          setCurrentNamedVersion,
        );

        if (!shouldContinue) {
          setHasNextPage(false);
          return;
        }

        // Filter to only versions older than current
        const relevantVersions = filterRelevantVersions(namedVersions, currentChangeset);

        // Fetch offset changesets for the relevant versions
        const results = await fetchOffsetChangesets(iModelsClient, iModelId, relevantVersions);

        // Process results and create page entries
        const pageEntries = processChangesetResults(results, relevantVersions);

        // Add to entries if we have any
        if (pageEntries.length > 0) {
          setEntries(prev => prev.concat(pageEntries));
        }

        setCurrentPage(prev => prev + 1);
        setHasNextPage(namedVersions.length === pageSize);

      } catch (error) {
        if (!isAbortError(error)) {
          setIsError(true);
        }
      } finally {
        setIsNextPageLoading(false);
      }
    },
    [isNextPageLoading, hasNextPage, currentChangeset, iModelsClient, iModelId, currentPage, currentNamedVersion, setCurrentNamedVersion, setEntries, setCurrentPage, setHasNextPage, setIsError, setIsNextPageLoading],
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

/**
 * Fetches a page of named versions from the API and updates the current named version
 * if it's synthetic and a real version is found.
 *
 * @param iModelsClient - The iModels client for API calls
 * @param iModelId - The ID of the iModel to fetch versions for
 * @param currentPage - The current page number for pagination
 * @param pageSize - The number of items to fetch per page
 * @param currentNamedVersion - The current named version (may be synthetic)
 * @param currentChangeset - The current changeset information
 * @param setCurrentNamedVersion - Function to update the current named version state
 * @returns Promise resolving to the fetched named versions and continuation flag
 */
async function fetchNamedVersionsPage(
  iModelsClient: IModelsClient,
  iModelId: string,
  currentPage: number,
  pageSize: number,
  currentNamedVersion: CurrentNamedVersion | undefined,
  currentChangeset: Changeset,
  setCurrentNamedVersion: (version: CurrentNamedVersion) => void,
): Promise<{ namedVersions: NamedVersion[]; shouldContinue: boolean; }> {
  const namedVersions = await iModelsClient.getNamedVersions({
    iModelId,
    top: pageSize,
    skip: currentPage * pageSize,
    orderby: "changesetIndex",
    ascendingOrDescending: "desc",
  });

  /**
   * We create a named version from the current changeset and update this later once the real named version is queried.
   * If the current changeset does not have a named version, then we keep the synthetic one.
   */
  if (currentNamedVersion?.isSynthetic) {
    setCurrentNamedVersion(getOrCreateCurrentNamedVersion(namedVersions, currentChangeset));
  }

  if (namedVersions.length === 0) {
    return { namedVersions, shouldContinue: false };
  }

  return { namedVersions, shouldContinue: true };
}

/**
 * Filters named versions to only include those older than the current changeset.
 *
 * @param namedVersions - Array of named versions to filter
 * @param currentChangeset - The current changeset to compare against
 * @returns Array of named versions that are older than the current changeset
 */
function filterRelevantVersions(namedVersions: NamedVersion[], currentChangeset: Changeset): NamedVersion[] {
  // Filter to only versions older than current
  return namedVersions.filter(nv => nv.changesetIndex < currentChangeset.index);
}

/**
 * Fetches offset changesets for each named version. The offset is needed because
 * the changeset is "already applied" to the named version according to the API docs.
 * See: https://developer.bentley.com/tutorials/changed-elements-api/#221-using-the-api-to-get-changed-elements
 *
 * @param iModelsClient - The iModels client for API calls
 * @param iModelId - The ID of the iModel to fetch changesets for
 * @param relevantVersions - Array of named versions to fetch offset changesets for
 * @returns Promise resolving to settled results of offset changeset fetch operations
 */
async function fetchOffsetChangesets(
  iModelsClient: IModelsClient,
  iModelId: string,
  relevantVersions: NamedVersion[],
): Promise<PromiseSettledResult<{ namedVersion: NamedVersion; offsetChangeset: Changeset | undefined; offsetChangesetIndex: string; }>[]> {
  const changesetPromises = relevantVersions.map(async (namedVersion) => {
    const offsetChangesetIndex = (namedVersion.changesetIndex + 1).toString();
    const offsetChangeset = await iModelsClient.getChangeset({
      iModelId: iModelId,
      changesetId: offsetChangesetIndex,
    });
    return { namedVersion, offsetChangeset, offsetChangesetIndex };
  });

  return Promise.allSettled(changesetPromises);
}

/**
 * Processes the results from fetching offset changesets and creates page entries
 * for successfully retrieved changesets.
 *
 * @param results - Promise settled results from offset changeset fetch operations
 * @param relevantVersions - Array of named versions corresponding to the results
 * @returns Array of VersionCompareEntry objects for successfully processed changesets
 */
function processChangesetResults(
  results: PromiseSettledResult<{ namedVersion: NamedVersion; offsetChangeset: Changeset | undefined; offsetChangesetIndex: string; }>[],
  relevantVersions: NamedVersion[],
): VersionCompareEntry[] {
  // Process results
  const pageEntries: VersionCompareEntry[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.offsetChangeset) {
      pageEntries.push({
        namedVersion: {
          ...result.value.namedVersion,
          targetChangesetId: result.value.offsetChangeset.id,
        },
        job: undefined,
      });
    } else {
      const namedVersion = relevantVersions[index];
      // eslint-disable-next-line no-console
      console.warn(`Could not fetch target changeset for named version ${namedVersion.displayName}`);
    }
  });

  return pageEntries;
}

/**
 * Gets or creates a current named version based on the changeset and available named versions.
 * First checks if the current changeset already has a corresponding named version in the provided list.
 * If found, returns it as a non-synthetic version. If not found, creates a synthetic named version
 * using the changeset information, which will be used until a real named version is discovered
 * or confirmed to not exist.
 *
 * @param namedVersions - List of named versions to search for an existing match
 * @param currentChangeset - The current changeset to create or find a named version for
 * @returns A CurrentNamedVersion that is either real (isSynthetic: false) or synthetic (isSynthetic: true)
 */
function getOrCreateCurrentNamedVersion(
  namedVersions: NamedVersion[],
  currentChangeset: Changeset,
): CurrentNamedVersion {

  // Check if current changeset has a named version
  const existingNamedVersion = namedVersions.find(
    nv => nv.changesetId === currentChangeset.id || nv.changesetIndex === currentChangeset.index,
  );

  if (existingNamedVersion) {
    return { ...existingNamedVersion, isSynthetic: false };
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
    isSynthetic: true,
  };
}

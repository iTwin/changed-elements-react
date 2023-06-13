/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { useLayoutEffect, useState } from "react";

import { Changeset, NamedVersion } from "./NamedVersionSelector.js";

export interface ChangesetInfo {
  changesets: Changeset[];
  namedVersions?: NamedVersion[] | undefined;
}

export type UseVersionSelectorResult = {
  changesets: Changeset[];
  namedVersions: NamedVersion[];
} & (UseVersionSelectorStatusLoading | UseVersionSelectorStatusReady | UseVersionSelectorStatusError);

export interface UseVersionSelectorStatusLoading {
  status: "loading";
}

export interface UseVersionSelectorStatusReady {
  status: "ready";
  loadMore: (() => void) | undefined;
}

export interface UseVersionSelectorStatusError {
  status: "error";
  error: unknown;
  retry: () => void;
}

export function useVersionSelector(getChangesetInfo: () => AsyncIterable<ChangesetInfo>): UseVersionSelectorResult {
  const [result, setResult] = useState<UseVersionSelectorResult>({
    changesets: [],
    namedVersions: [],
    status: "loading",
  });

  // With useEffect loading state would flash on screen when data is resolved in the same task
  useLayoutEffect(
    () => {
      setResult({
        changesets: [],
        namedVersions: [],
        status: "loading",
      });

      let resolveContinueLoading = (_: boolean) => {};
      let continueLoading = Promise.resolve(true);
      let disposed = false;
      void (async () => {
        const iterator = getChangesetInfo()[Symbol.asyncIterator]();
        while (await continueLoading) {
          if (disposed) {
            break;
          }

          setResult((prev) => ({
            changesets: prev.changesets,
            namedVersions: prev.namedVersions,
            status: "loading",
          }));

          try {
            const result = await iterator.next();
            if (disposed) {
              break;
            }

            const { changesets, namedVersions = [] } = result.value ?? { changesets: [], namedVerions: [] };

            continueLoading = new Promise((resolve) => { resolveContinueLoading = resolve; });
            setResult((prev) => ({
              changesets: prev.changesets.concat(changesets),
              namedVersions: prev.namedVersions.concat(namedVersions),
              status: "ready",
              loadMore: result.done ? undefined : () => { resolveContinueLoading(true); }
            }));

            if (result.done) {
              break;
            }
          } catch (error) {
            if (!disposed) {
              continueLoading = new Promise((resolve) => { resolveContinueLoading = resolve; });
              setResult((prev) => ({
                changesets: prev.changesets,
                namedVersions: prev.namedVersions,
                status: "error",
                error,
                retry: () => { resolveContinueLoading(true); },
              }));
            }
          }
        }
      })();

      return () => {
        resolveContinueLoading(false);
        disposed = true;
      };
    },
    [getChangesetInfo],
  );

  return result;
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { useEffect, useState } from "react";

import { Changeset, NamedVersion } from "./NamedVersionSelector.js";

export interface ChangesetInfo {
  changesets: Changeset[];
  namedVersions?: NamedVersion[] | undefined;
}

export type UseVersionSelectorResult = ChangesetInfo
  & (UseVersionSelectorStatusLoading | UseVersionSelectorStatusReady | UseVersionSelectorStatusError);

export interface UseVersionSelectorStatusLoading {
  status: "loading";
}

export interface UseVersionSelectorStatusReady {
  status: "ready";
}

export interface UseVersionSelectorStatusError {
  status: "error";
  error: unknown;
}

export function useVersionSelector(getChangesetInfo: () => AsyncIterable<ChangesetInfo>): UseVersionSelectorResult {
  const [result, setResult] = useState<UseVersionSelectorResult>({ status: "loading", changesets: [], namedVersions: [] });
  useEffect(
    () => {
      let disposed = false;
      void (async () => {
        try {
          const iterator = getChangesetInfo()[Symbol.asyncIterator]();
          const result = await iterator.next();
          const { changesets, namedVersions } = result.value ?? { changesets: [], namedVersions: [] };
          if (!disposed) {
            setResult((prev) => {
              return {
                status: "ready",
                changesets: prev.changesets.concat(changesets),
                namedVersions: prev.namedVersions?.concat(namedVersions),
              };
            });
          }
        } catch (error) {
          setResult((prev) => ({ ...prev, status: "error", error }));
        }
      })();

      return () => {
        setResult({ status: "loading", changesets: [], namedVersions: [] });
        disposed = true;
      };
    },
    [getChangesetInfo],
  );
  // useEffect(
  //   () => {
  //     let disposed = false;
  //     void (async () => {
  //       let activeState: UseVersionSelectorResult = { status: "loading" };
  //       setResult((prev) => prev.status === "loading" ? prev : activeState);

  //       try {
  //         const [changesets, namedVersions] = await Promise.all([
  //           manager.changesetCache.getOrderedChangesets(iModelId),
  //           manager.changesetCache.getVersions(iModelId),
  //         ]);
  //         activeState = {
  //           status: "ready",
  //           changesets: changesets.map(
  //             (changeset) => ({
  //               id: changeset.id,
  //               description: changeset.description,
  //               date: new Date(changeset.pushDateTime),
  //               isProcessed: false,
  //             }),
  //           ),
  //           namedVersions: namedVersions.map(
  //             (namedVersion) => ({
  //               id: namedVersion.id,
  //               changesetId: namedVersion.changesetId ?? "",
  //               displayName: namedVersion.displayName,
  //               description: namedVersion.description ?? "",
  //               date: namedVersion.createdDateTime,
  //             }),
  //           ),
  //         };
  //       } catch (error) {
  //         activeState = { status: "error", error };
  //       }

  //       if (!disposed) {
  //         setResult(activeState);
  //       }
  //     })();

  //     return () => { disposed = true; };
  //   },
  //   [iModelId],
  // );

  return result;
}

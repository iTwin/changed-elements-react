/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { useEffect, useMemo, useRef } from "react";
import { isAbortError } from "../utils/utils.js";

interface UseQueueResult<T> {
  addItem: (item: T) => { cancel: () => void; };
}

/**
 * For each added queue item, sequentially executes and awaits the provided callback.
 * Watch out, items are deduplicated and won't be re-inserted until queue empties.
 */
export function useQueue<T>(
  callback: (item: T, signal: AbortSignal) => Promise<void>,
): UseQueueResult<T> {
  const queueRef = useRef(new Set<T>());
  const callbackRef = useRef(callback);
  useEffect(
    () => { callbackRef.current = callback; },
    [callback],
  );

  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef(new AbortController());
  useEffect(
    () => {
      const abortController = abortControllerRef.current;
      return () => {
        abortController.abort();
      };
    },
    [],
  );

  return useMemo(
    () => ({
      addItem: (item: T) => {
        queueRef.current.add(item);

        if (!isProcessingRef.current) {
          void (async () => {
            try {
              isProcessingRef.current = true;
              for (const value of queueRef.current.values()) {
                try {
                  abortControllerRef.current.signal.throwIfAborted();
                  await callbackRef.current(value, abortControllerRef.current.signal);
                  abortControllerRef.current.signal.throwIfAborted();
                } catch (error) {
                  if (isAbortError(error)) {
                    throw error;
                  }

                  // eslint-disable-next-line no-console
                  console.error(error);
                }
              }

              queueRef.current.clear();
            } catch (error) {
              if (!isAbortError(error)) {
                // eslint-disable-next-line no-console
                console.error(error);
              }
            } finally {
              isProcessingRef.current = false;
            }
          })();
        }

        return { cancel: () => void queueRef.current.delete(item) };
      },
    }),
    [],
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { ForwardedRef, RefCallback } from "react";

/** Models BeEvent class interface. */
export interface EventEmitter<T extends (...arg: unknown[]) => void> {
  addListener(eventListener: T): void;
  removeListener(eventListener: T): void;
}

/** Merges multiple React refs into one. */
export function mergeRefs<T>(...refs: Array<ForwardedRef<T>>): RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref) {
        ref.current = value;
      }
    });
  };
}

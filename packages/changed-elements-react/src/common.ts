/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Models BeEvent class interface. */
export interface EventEmitter<T extends (...arg: unknown[]) => void> {
  addListener(eventListener: T): void;
  removeListener(eventListener: T): void;
}

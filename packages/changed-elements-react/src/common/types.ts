/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent } from "@itwin/core-bentley";

export type ReactComponentLifeCycle = "mounted" | "updating" |"unmounted";
export type EventActionTuple = {
  event: BeEvent<() => void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (...args: any[]) => void;
};

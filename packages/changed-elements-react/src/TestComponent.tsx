/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ReactElement } from "react";
import { test } from "@itwin/changed-elements-client";

/** Test component */
export function TestComponent(): ReactElement {
  return <>{test()}</>;
}

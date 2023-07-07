/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { VersionCompareManager } from "@itwin/changed-elements-react";
import { PrimitiveTool } from "@itwin/core-frontend";


/** Dummy Tool used to avoid element selection during property comparison */
export class DummyTool extends PrimitiveTool {
  public namespace = VersionCompareManager.namespace;

  public async onRestartTool(): Promise<void> {
    // No-op
  }

  public static override toolId = "DummyTool";
}

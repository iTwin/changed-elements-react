/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  BentleyCloudRpcManager, BentleyCloudRpcParams, IModelReadRpcInterface, SnapshotIModelRpcInterface,
} from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";

export async function initializeITwinJsApp(): Promise<void> {
  await IModelApp.startup({
    localization: new ITwinLocalization({
      initOptions: { lng: "en" },
    }),
  });
  const rpcParams: BentleyCloudRpcParams = {
    info: { title: "test-app-backend", version: "v1.0" },
    uriPrefix: "http://localhost:3001",
  };
  BentleyCloudRpcManager.initializeClient(rpcParams, [SnapshotIModelRpcInterface, IModelReadRpcInterface]);
}

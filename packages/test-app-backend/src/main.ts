/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { BentleyCloudRpcManager, IModelReadRpcInterface, SnapshotIModelRpcInterface } from "@itwin/core-common";
import { IModelJsExpressServer } from "@itwin/express-server";

void (async () => {
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Info);
  await IModelHost.startup();

  const rpcConfig = BentleyCloudRpcManager.initializeImpl(
    { info: { title: "test-app-backend", version: "v1.0" } },
    [SnapshotIModelRpcInterface, IModelReadRpcInterface],
  );
  const server = new IModelJsExpressServer(rpcConfig.protocol);

  const port = 3001;
  await server.initialize(3001);
  // eslint-disable-next-line no-console
  console.log(`Backend (PID ${process.pid}) is listening on port ${port}.`);
})();

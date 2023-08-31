/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { BentleyCloudRpcManager, IModelReadRpcInterface, IModelTileRpcInterface } from "@itwin/core-common";
import { IModelJsExpressServer } from "@itwin/express-server";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { Presentation } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { config } from "dotenv-flow";

config({ path: "../test-app-frontend" });

void (async () => {
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Info);
  await IModelHost.startup({
    cacheDir: "./.cache",
    hubAccess: new BackendIModelsAccess(
      new IModelsClient({ api: { baseUrl: `https://${process.env.VITE_URL_PREFIX}api.bentley.com/imodels` } }),
    ),
  });
  Presentation.initialize();

  const rpcConfig = BentleyCloudRpcManager.initializeImpl(
    { info: { title: "test-app-backend", version: "v1.0" } },
    [IModelReadRpcInterface, IModelTileRpcInterface, PresentationRpcInterface],
  );
  const server = new IModelJsExpressServer(rpcConfig.protocol);

  const port = 3001;
  await server.initialize(3001);
  console.log(`Backend (PID ${process.pid}) is listening on port ${port}.`);
})();

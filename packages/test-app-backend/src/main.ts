/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as express from "express";
import { IModelHost } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { BentleyCloudRpcManager, HttpServerRequest, HttpServerResponse, IModelReadRpcInterface, IModelTileRpcInterface, RpcManager } from "@itwin/core-common";
import { IModelJsExpressServer } from "@itwin/express-server";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import { IModelsClient } from "@itwin/imodels-client-authoring";
import { Presentation } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { config } from "dotenv-flow";
import { ChangesetGroupRPCInterface } from "./RPC/ChangesetGroupRPCInterface.js";
import { ChangesetGroupRPCImpl } from "./RPC/ChangesetGroupRPCImpl.js";

config({ path: "../test-app-frontend" });

const port = Number.parseInt(process.env.VITE_LOCAL_BACKEND_PORT ?? "", 10);

void (async () => {
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Info);
  await IModelHost.startup({
    cacheDir: `./.cache_${port}`,
    hubAccess: new BackendIModelsAccess(
      new IModelsClient({ api: { baseUrl: `https://${process.env.VITE_URL_PREFIX}api.bentley.com/imodels` } }),
    ),
  });
  Presentation.initialize();
  RpcManager.registerImpl(ChangesetGroupRPCInterface, ChangesetGroupRPCImpl);
  const rpcConfig = BentleyCloudRpcManager.initializeImpl(
    { info: { title: "test-app-backend", version: "v1.0" } },
    [IModelReadRpcInterface, IModelTileRpcInterface, PresentationRpcInterface, ChangesetGroupRPCInterface],
  );
  const app = express();
  const server = new IModelJsExpressServer(rpcConfig.protocol);

  await server.initialize(port);
  console.log(`Backend (PID ${process.pid}) is listening on port ${port}.`);

  app.post("*", async (request: HttpServerRequest, response: HttpServerResponse) => {
    await rpcConfig.protocol.handleOperationPostRequest(request, response);
  });
})();

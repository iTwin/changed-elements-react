/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelHost } from "@itwin/core-backend";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { BentleyCloudRpcManager, HttpServerRequest, HttpServerResponse, IModelReadRpcInterface, IModelTileRpcInterface, RpcManager } from "@itwin/core-common";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { IModelJsExpressServer } from "@itwin/express-server";
import { BackendIModelsAccess } from "@itwin/imodels-access-backend";
import { IModelsClientOptions } from "@itwin/imodels-client-authoring";
import { AzureClientStorage, BlockBlobClientWrapperFactory } from "@itwin/object-storage-azure";
import { Presentation } from "@itwin/presentation-backend";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { config } from "dotenv-flow";
import express from "express";
import { ChangesRpcImpl } from "./RPC/ChangesRpcImpl";
import { ChangesRpcInterface } from "./RPC/ChangesRpcInterface";

config({ path: "../test-app-frontend" });

const port = Number.parseInt(process.env.VITE_LOCAL_BACKEND_PORT ?? "", 10);

void (async () => {
  Logger.initializeToConsole();
  Logger.setLevelDefault(LogLevel.Info);
  const opts: IModelsClientOptions = {
    cloudStorage: new AzureClientStorage(new BlockBlobClientWrapperFactory()),
    api: {
      baseUrl: `https://${process.env.VITE_URL_PREFIX}api.bentley.com/imodels`,
      version: "itwin-platform.v2",
    },
  };
  await IModelHost.startup({
    cacheDir: `./.cache_${port}`,
    hubAccess: new BackendIModelsAccess(opts),
  });
  Presentation.initialize();
  ECSchemaRpcImpl.register();
  RpcManager.registerImpl(ChangesRpcInterface, ChangesRpcImpl);
  const rpcConfig = BentleyCloudRpcManager.initializeImpl(
    { info: { title: "test-app-backend", version: "v1.0" } },
    [IModelReadRpcInterface, IModelTileRpcInterface, PresentationRpcInterface, ChangesRpcInterface, ECSchemaRpcInterface],
  );
  const app = express();
  const server = new IModelJsExpressServer(rpcConfig.protocol);
  await server.initialize(port);
  console.log(`Backend (PID ${process.pid}) is listening on port ${port}.`);

  app.post("*", async (request: HttpServerRequest, response: HttpServerResponse) => {
    await rpcConfig.protocol.handleOperationPostRequest(request, response);
  });
})();

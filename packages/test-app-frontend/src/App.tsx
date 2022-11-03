/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { TestComponent } from "@itwin/changed-elements-react";
import {
  BentleyCloudRpcManager, BentleyCloudRpcParams, IModelReadRpcInterface, Localization, SnapshotIModelRpcInterface,
} from "@itwin/core-common";
import { IModelApp, SnapshotConnection } from "@itwin/core-frontend";
import { useEffect } from "react";

export function App(): React.ReactElement {
  useEffect(
    () => {
      void initializeITwinJsApp();
    },
    [],
  );

  return <TestComponent />;
}

export async function initializeITwinJsApp(): Promise<void> {
  await IModelApp.startup({ localization });
  const rpcParams: BentleyCloudRpcParams = {
    info: { title: "test-app-backend", version: "v1.0" },
    uriPrefix: "http://localhost:3001",
  };
  BentleyCloudRpcManager.initializeClient(rpcParams, [SnapshotIModelRpcInterface, IModelReadRpcInterface]);
  await SnapshotConnection.openFile("snapshot.bim");
}

const localization: Localization = {
  initialize: () => Promise.resolve(),
  getLocalizedString: () => "",
  getLocalizedStringWithNamespace: () => "",
  getEnglishString: () => "",
  getLocalizedKeys: () => "",
  registerNamespace: () => Promise.resolve(),
  unregisterNamespace: () => { },
  getNamespacePromise: () => undefined,
  getLanguageList: () => [],
  changeLanguage: () => Promise.resolve(),
};

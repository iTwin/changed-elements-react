/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ReactElement, useEffect, useState } from "react";
import { getChangesets, GetChangesetsResult, VersionSelectDialog } from "@itwin/changed-elements-react";
import {
  AuthorizationClient, BentleyCloudRpcManager, BentleyCloudRpcParams, IModelReadRpcInterface,
  SnapshotIModelRpcInterface,
} from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { UiCore } from "@itwin/core-react";
import { FrontendIModelsAccess } from "@itwin/imodels-access-frontend";
import { LoadingScreen } from "../common/LoadingScreen";
import {
  getIModelChangesets, GetIModelChangesetsResult, GetIModelNamedVersionResult, getIModelNamedVersions,
} from "../ITwinApi";

export interface ITwinJsAppProps {
  iTwinId: string;
  iModelId: string;
  authorizationClient: AuthorizationClient;
}

export function ITwinJsApp(props: ITwinJsAppProps): ReactElement | null {
  const [changesets, setChangesets] = useState<GetIModelChangesetsResult["changesets"]>();
  useEffect(
    () => {
      let disposed = false;
      void (async () => {
        const result = await getIModelChangesets(
          { iModelId: props.iModelId },
          { authorizationClient: props.authorizationClient },
        );
        if (!disposed) {
          setChangesets(result?.changesets);
        }
      })();

      return () => { disposed = true; };
    },
    [props.authorizationClient, props.iModelId],
  );

  const [namedVersions, setNamedVersions] = useState<GetIModelNamedVersionResult["namedVersions"]>();
  useEffect(
    () => {
      let disposed = false;
      void (async () => {
        const result = await getIModelNamedVersions(
          { iModelId: props.iModelId },
          { authorizationClient: props.authorizationClient },
        );
        if (!disposed) {
          setNamedVersions(result?.namedVersions);
        }
      })();

      return () => { disposed = true; };
    },
    [props.authorizationClient, props.iModelId],
  );

  const [changesetStatus, setChangesetStatus] = useState<GetChangesetsResult["changesetStatus"]>();
  useEffect(
    () => {
      let disposed = false;
      void (async () => {
        const result = await getChangesets(
          { iTwinId: props.iTwinId, iModelId: props.iModelId },
          { accessToken: await props.authorizationClient.getAccessToken(), baseUrl: "https://qa-api.bentley.com/changedelements" },
        );
        if (!disposed) {
          setChangesetStatus(result.changesetStatus);
        }
      })();

      return () => { disposed = true; };
    },
    [props.authorizationClient, props.iModelId, props.iTwinId],
  );

  if (changesets === undefined || namedVersions === undefined || changesetStatus === undefined) {
    return <LoadingScreen>Loading changesets...</LoadingScreen>;
  }

  const lastChangeset = changesets.at(-1);
  if (lastChangeset === undefined) {
    return null;
  }

  return (
    <VersionSelectDialog
      localization={IModelApp.localization}
      iTwinId={props.iTwinId}
      iModelId={props.iModelId}
      changesetId={changesets[21].id}
      changesets={changesets.map((changeset) => changeset.id).reverse()}
      changesetStatus={changesetStatus}
      namedVersions={namedVersions}
      onOk={() => { }}
      onCancel={() => { }}
    />
  );
}

export async function initializeITwinJsApp(): Promise<void> {
  await IModelApp.startup({
    localization: new ITwinLocalization({
      initOptions: { lng: "en" },
      urlTemplate: "/locales/{{lng}}/{{ns}}.json",
    }),
    hubAccess: new FrontendIModelsAccess(),
  });
  const rpcParams: BentleyCloudRpcParams = {
    info: { title: "test-app-backend", version: "v1.0" },
    uriPrefix: "http://localhost:3001",
  };
  BentleyCloudRpcManager.initializeClient(rpcParams, [SnapshotIModelRpcInterface, IModelReadRpcInterface]);
  await UiCore.initialize(IModelApp.localization);
  await IModelApp.localization.registerNamespace("VersionCompare");
}

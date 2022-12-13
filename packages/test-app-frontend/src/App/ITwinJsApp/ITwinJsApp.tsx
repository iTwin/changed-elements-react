/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ReactElement, useEffect, useState } from "react";
import { MessageManager, UiFramework } from "@itwin/appui-react";
import {
  ChangedElementsWidget, getChangesets, GetChangesetsResult, NamedVersion, VersionCompare, VersionSelectDialog,
} from "@itwin/changed-elements-react";
import {
  AuthorizationClient, BentleyCloudRpcManager, BentleyCloudRpcParams, IModelReadRpcInterface,
} from "@itwin/core-common";
import {
  CheckpointConnection, IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, OutputMessageType,
} from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { UiCore } from "@itwin/core-react";
import { FrontendIModelsAccess } from "@itwin/imodels-access-frontend";
import { IModelsClient } from "@itwin/imodels-client-management";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Modal } from "@itwin/itwinui-react";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { applyUrlPrefix } from "../../environment";
import { LoadingIndicator } from "../common/LoadingIndicator";
import {
  getIModelChangesets, GetIModelChangesetsResult, GetIModelNamedVersionResult, getIModelNamedVersions,
} from "../ITwinApi";
import { LoadingScreen } from "../common/LoadingScreen";

export interface ITwinJsAppProps {
  iTwinId: string;
  iModelId: string;
  authorizationClient: AuthorizationClient;
}

export function ITwinJsApp(props: ITwinJsAppProps): ReactElement | null {
  const iModel = useIModel(props.iTwinId, props.iModelId, props.authorizationClient);
  useEffect(() => { UiFramework.setIModelConnection(iModel); }, [iModel]);

  const [showDialog, setShowDialog] = useState(false);
  const handleOk = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
    if (iModel) {
      setShowDialog(false);
      void VersionCompare.manager?.startComparison(iModel, currentVersion, targetVersion);
    }
  };

  if (!iModel) {
    return <LoadingScreen>Opening iModel...</LoadingScreen>;
  }

  return (
    <PageLayout.Content>
      <ChangedElementsWidget handleCompare={() => setShowDialog(true)} />
      {
        showDialog &&
        <VersionSelect
          iTwinId={props.iTwinId}
          iModelId={props.iModelId}
          authorizationClient={props.authorizationClient}
          onCancel={() => setShowDialog(false)}
          onOk={handleOk}
        />
      }
    </PageLayout.Content>
  );
}

interface VersionSelectProps {
  iTwinId: string;
  iModelId: string;
  authorizationClient: AuthorizationClient;
  onCancel: () => void;
  onOk: (currentVersion: NamedVersion, targetVersion: NamedVersion) => void;
}

function VersionSelect(props: VersionSelectProps): ReactElement | null {
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
          {
            accessToken: await props.authorizationClient.getAccessToken(),
            baseUrl: applyUrlPrefix("https://api.bentley.com/changedelements"),
          },
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
    return <Modal title="" isOpen><LoadingIndicator>Loading changesets...</LoadingIndicator></Modal>;
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
      changesetId={lastChangeset.id}
      changesets={changesets.map((changeset) => changeset.id).reverse()}
      changesetStatus={changesetStatus}
      namedVersions={namedVersions}
      onOk={props.onOk}
      onCancel={props.onCancel}
    />
  );
}

export async function initializeITwinJsApp(): Promise<void> {
  if (IModelApp.initialized) {
    return;
  }

  await IModelApp.startup({
    localization: new ITwinLocalization({
      initOptions: { lng: "en" },
      urlTemplate: "/locales/{{lng}}/{{ns}}.json",
    }),
    hubAccess: new FrontendIModelsAccess(
      new IModelsClient({ api: { baseUrl: applyUrlPrefix("https://api.bentley.com/imodels") } }),
    ),
  });
  const rpcParams: BentleyCloudRpcParams = {
    info: { title: "test-app-backend", version: "v1.0" },
    uriPrefix: "http://localhost:3001",
  };
  BentleyCloudRpcManager.initializeClient(rpcParams, [IModelReadRpcInterface, PresentationRpcInterface]);
  await Promise.all([
    UiCore.initialize(IModelApp.localization),
    Presentation.initialize(),
    UiFramework.initialize(undefined),
  ]);
  VersionCompare.initialize({});
}

function useIModel(
  iTwinId: string,
  iModelId: string,
  authorizationClient: AuthorizationClient,
): IModelConnection | undefined {
  const [iModel, setIModel] = useState<IModelConnection>();

  useEffect(
    () => {
      setIModel(undefined);
      IModelApp.authorizationClient = authorizationClient;

      let disposed = false;
      const iModelPromise = CheckpointConnection.openRemote(iTwinId, iModelId);
      void (async () => {
        try {
          const openedIModel = await iModelPromise;
          if (!disposed) {
            setIModel(openedIModel);
          }
        } catch (error) {
          displayIModelError(IModelApp.localization.getLocalizedString("App:error:imodel-open-remote"), error);
        }
      })();

      return () => {
        disposed = true;
        void (async () => {
          const openedIModel = await iModelPromise;
          try {
            await openedIModel.close();
          } catch (error) {
            displayIModelError(IModelApp.localization.getLocalizedString("App:error:imodel-close-remote"), error);
          }
        })();
      };
    },
    [authorizationClient, iModelId, iTwinId],
  );

  return iModel;
}

function displayIModelError(message: string, error: unknown): void {
  const errorMessage = (error && typeof error === "object") ? (error as { message: unknown; }).message : error;
  displayToast(OutputMessagePriority.Error, message, typeof errorMessage === "string" ? errorMessage : undefined);
}

function displayToast(messageType: OutputMessagePriority, messageShort: string, messageDetail?: string): void {
  const messageDetails = new NotifyMessageDetails(messageType, messageShort, messageDetail, OutputMessageType.Toast);
  MessageManager.outputMessage(messageDetails);
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { MessageManager, UiFramework } from "@itwin/appui-react";
import { VersionCompare, VersionCompareSelectDialog } from "@itwin/changed-elements-react";
import {
  AuthorizationClient, BentleyCloudRpcManager, BentleyCloudRpcParams, IModelReadRpcInterface
} from "@itwin/core-common";
import {
  CheckpointConnection, IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, OutputMessageType
} from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { UiCore } from "@itwin/core-react";
import { FrontendIModelsAccess } from "@itwin/imodels-access-frontend";
import { IModelsClient } from "@itwin/imodels-client-management";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { ReactElement, useEffect, useState } from "react";
import { applyUrlPrefix } from "../../environment";
import { LoadingScreen } from "../common/LoadingScreen";

export interface ITwinJsAppProps {
  iTwinId: string;
  iModelId: string;
  authorizationClient: AuthorizationClient;
}

export function ITwinJsApp(props: ITwinJsAppProps): ReactElement | null {
  const iModel = useIModel(props.iTwinId, props.iModelId, props.authorizationClient);
  useEffect(() => { UiFramework.setIModelConnection(iModel); }, [iModel]);

  if (!iModel) {
    return <LoadingScreen>Opening iModel...</LoadingScreen>;
  }

  return (
    <PageLayout.Content>
      <VersionCompareSelectDialog />
    </PageLayout.Content>
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

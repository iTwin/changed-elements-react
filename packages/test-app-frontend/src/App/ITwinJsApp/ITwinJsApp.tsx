/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  AppNotificationManager, ConfigurableUiContent, IModelViewportControl, ReducerRegistryInstance, StagePanelLocation,
  StagePanelSection, StagePanelState, StageUsage, StandardFrontstageProvider, UiFramework, UiItemsManager,
  UiItemsProvider, type Widget
} from "@itwin/appui-react";
import {
  ChangedElementsWidget, ComparisonJobClient, ITwinIModelsClient, VersionCompare, VersionCompareContext} from "@itwin/changed-elements-react";
import { Id64 } from "@itwin/core-bentley";
import {
  AuthorizationClient, BentleyCloudRpcManager, BentleyCloudRpcParams, IModelReadRpcInterface, IModelTileRpcInterface
} from "@itwin/core-common";
import {
  CheckpointConnection, IModelApp, IModelConnection, ViewCreator3d, ViewState
} from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { UiCore } from "@itwin/core-react";
import { FrontendIModelsAccess } from "@itwin/imodels-access-frontend";
import { IModelsClient } from "@itwin/imodels-client-management";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { toaster } from "@itwin/itwinui-react";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { ReactElement, useEffect, useMemo, useState } from "react";

import { applyUrlPrefix } from "../../environment";
import { LoadingScreen } from "../common/LoadingScreen";
import { AppUiVisualizationHandler } from "./AppUi/AppUiVisualizationHandler";
import { UIFramework } from "./AppUi/UiFramework";
import { VersionCompareReducer } from "./AppUi/redux/VersionCompareStore";
import { MockSavedFiltersManager } from "./MockSavedFiltersManager";

export interface ITwinJsAppProps {
  iTwinId: string;
  iModelId: string;
  authorizationClient: AuthorizationClient;
}

export function ITwinJsApp(props: ITwinJsAppProps): ReactElement | null {
  type LoadingState = "opening-imodel" | "opening-viewstate" | "creating-viewstate" | "loaded";
  const [loadingState, setLoadingState] = useState<LoadingState>("opening-imodel");
  const iModel = useIModel(props.iTwinId, props.iModelId, props.authorizationClient);
  useEffect(
    () => {
      if (!iModel) {
        return;
      }

      let disposed = false;
      void (async () => {
        await VersionCompare.manager?.stopComparison();

        setLoadingState("opening-viewstate");
        let viewState = await getStoredViewState(iModel);
        if (disposed) {
          return;
        }

        if (!viewState) {
          setLoadingState("creating-viewstate");
          const viewCreator = new ViewCreator3d(iModel);
          viewState = await viewCreator.createDefaultView();
        }

        if (!disposed) {
          setLoadingState("loaded");
          UiFramework.setIModelConnection(iModel);
          UiFramework.setDefaultViewState(viewState);
          UiFramework.frontstages.addFrontstageProvider(new MainFrontstageProvider());
          await UiFramework.frontstages.setActiveFrontstage(MainFrontstageProvider.name);
        }
      })();
      return () => { disposed = true; };
    },
    [iModel],
  );

  const iModelsClient = useMemo(
    () => {
      return new ITwinIModelsClient({
        baseUrl: applyUrlPrefix("https://api.bentley.com/imodels"),
        getAccessToken: () => props.authorizationClient.getAccessToken(),
        showHiddenNamedVersions: true,
      });
    },
    [props.authorizationClient],
  );

  const comparisonJobClient = useMemo(
    () => {
      return new ComparisonJobClient({
        baseUrl: applyUrlPrefix("https://api.bentley.com/changedelements"),
        getAccessToken: VersionCompare.getAccessToken,
      });
    },
    [],
  );

  if (loadingState === "opening-imodel") {
    return <LoadingScreen>Opening iModel...</LoadingScreen>;
  }

  if (loadingState === "opening-viewstate") {
    return <LoadingScreen>Opening ViewState...</LoadingScreen>;
  }

  if (loadingState === "creating-viewstate") {
    return <LoadingScreen>Creating ViewState...</LoadingScreen>;
  }

  return (
    <PageLayout.Content>
      <VersionCompareContext iModelsClient={iModelsClient} comparisonJobClient={comparisonJobClient} savedFilters={savedFilters}>
        <UIFramework>
          <ConfigurableUiContent />
        </UIFramework>
      </VersionCompareContext>
    </PageLayout.Content >
  );
}

const savedFilters = new MockSavedFiltersManager();

export async function initializeITwinJsApp(authorizationClient: AuthorizationClient): Promise<void> {
  if (IModelApp.initialized) {
    return;
  }

  const iModelsClient = new IModelsClient({ api: { baseUrl: applyUrlPrefix("https://api.bentley.com/imodels") } });
  await IModelApp.startup({
    localization: new ITwinLocalization({
      initOptions: { lng: "en" },
      urlTemplate: "/locales/{{lng}}/{{ns}}.json",
    }),
    notifications: new AppNotificationManager(),
    hubAccess: new FrontendIModelsAccess(iModelsClient),
    publicPath: "/",
  });
  const rpcParams: BentleyCloudRpcParams = {
    info: { title: "test-app-backend", version: "v1.0" },
    uriPrefix: "http://localhost:3001",
  };

  BentleyCloudRpcManager.initializeClient(
    rpcParams,
    [IModelReadRpcInterface, IModelTileRpcInterface, PresentationRpcInterface],
  );

  await Promise.all([
    UiCore.initialize(IModelApp.localization),
    Presentation.initialize(),
    UiFramework.initialize(undefined),
  ]);

  VersionCompare.initialize({
    changedElementsApiBaseUrl: applyUrlPrefix("https://api.bentley.com/changedelements"),
    getAccessToken: () => authorizationClient.getAccessToken(),
    wantReportGeneration: true,
    wantTooltipAugment: true,
    createVisualizationHandler: (manager) => new AppUiVisualizationHandler(
      manager,
      { frontstageIds: [MainFrontstageProvider.name] },
    ),
  });

  ReducerRegistryInstance.registerReducer("versionCompareState", VersionCompareReducer);
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
  toaster.negative(<>{message}<br /> {errorMessage}</>);
}

async function getStoredViewState(iModel: IModelConnection): Promise<ViewState | undefined> {
  let viewId: string | undefined = await iModel.views.queryDefaultViewId();
  if (viewId === Id64.invalid) {
    const viewDefinitionProps = await iModel.views.queryProps({ wantPrivate: false, limit: 1 });
    viewId = viewDefinitionProps[0]?.id;
  }

  return viewId ? iModel.views.load(viewId) : undefined;
}

class MainFrontstageProvider extends StandardFrontstageProvider {
  constructor() {
    super({
      id: MainFrontstageProvider.name,
      usage: StageUsage.General,
      contentGroupProps: {
        id: `${MainFrontstageProvider.name}ContentGroup`,
        layout: { id: `${MainFrontstageProvider.name}ContentGroupLayout` },
        contents: [{
          id: `${MainFrontstageProvider.name}ContentView`,
          classId: IModelViewportControl,
          applicationData: {
            viewState: UiFramework.getDefaultViewState(),
            iModelConnection: UiFramework.getIModelConnection(),
          },
        }],
      },
      rightPanelProps: {
        resizable: true,
        pinned: true,
        defaultState: StagePanelState.Open,
        size: 400,
      },
    });

    UiItemsManager.register(new MainFrontstageItemsProvider());
  }
}

class MainFrontstageItemsProvider implements UiItemsProvider {
  public readonly id = MainFrontstageItemsProvider.name;

  public provideWidgets(
    stageId: string,
    stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection,
  ): Widget[] {
    if (
      stageId !== MainFrontstageProvider.name ||
      stageUsage !== StageUsage.General ||
      location !== StagePanelLocation.Right ||
      section !== StagePanelSection.Start
    ) {
      return [];
    }

    return [{
      id: "ChangedElementsWidget",
      content: <ChangedElementsWidget useV2Widget
        feedbackUrl="https://example.com"
        iModelConnection={UiFramework.getIModelConnection()!}
        manageNamedVersionsSlot={<ManageNamedVersions />}
      />,
    }];
  }
}

function ManageNamedVersions() {
  return (
    <a
      href={"https://example.com"}
      target="_blank"
      rel="noopener noreferrer"
      className={"manage-named-versions-message"}
    >
      {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.manageNamedVersions")}
    </a>
  );
}

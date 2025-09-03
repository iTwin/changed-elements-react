/* eslint-disable no-console */
/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  AppNotificationManager, ConfigurableUiContent, FrontstageUtilities, IModelViewportControl, ReducerRegistryInstance,
  StagePanelLocation, StagePanelSection, StagePanelState, StageUsage, StandardFrontstageProvider, FrameworkFrontstages,
  UiFramework, UiItemsManager, type UiItemsProvider, type Widget
} from "@itwin/appui-react";
import {
  ChangedECInstance,
  ChangedElementsWidget,
  ComparisonJobClient,
  ITwinIModelsClient,
  NamedVersionSelectorWidget,
  VersionCompare,
  VersionCompareContext,
  VersionCompareFeatureTracking
} from "@itwin/changed-elements-react";
import {
  AuthorizationClient, BentleyCloudRpcManager, BentleyCloudRpcParams, ChangesetIdWithIndex, FeatureAppearance, IModelReadRpcInterface, IModelTileRpcInterface,
  TypeOfChange
} from "@itwin/core-common";
import {
  CheckpointConnection, FeatureSymbology, IModelApp, IModelConnection, QuantityFormatter, ViewCreator3d
} from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { UiCore } from "@itwin/core-react";
import { FrontendIModelsAccess } from "@itwin/imodels-access-frontend";
import { IModelsClient } from "@itwin/imodels-client-management";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { useToaster } from "@itwin/itwinui-react";
import { PresentationRpcInterface } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { ChangesRpcInterface, RelationshipClassWithDirection } from "../../../../test-app-backend/src/RPC/ChangesRpcInterface.js";
import { applyUrlPrefix, localBackendPort, runExperimental, useDirectComparison, usingLocalBackend } from "../../environment.js";
import { LoadingScreen } from "../common/LoadingScreen.js";
import { AppUiVisualizationHandler } from "./AppUi/AppUiVisualizationHandler.js";
import { UIFramework } from "./AppUi/UiFramework.js";
import { getUnifiedSelectionStorage } from "./AppUi/presentation/SelectionStorage.js";
import { VersionCompareReducer } from "./AppUi/redux/VersionCompareStore.js";
import { MockSavedFiltersManager } from "./MockSavedFiltersManager.js";

export interface ITwinJsAppProps {
  iTwinId: string;
  iModelId: string;
  authorizationClient: AuthorizationClient;
}

export function ITwinJsApp(props: ITwinJsAppProps): ReactElement | null {
  type LoadingState = "opening-imodel" | "opening-viewstate" | "creating-viewstate" | "loaded";
  const [loadingState, setLoadingState] = useState<LoadingState>("opening-imodel");
  const iModel = useIModel(props.iTwinId, props.iModelId, props.authorizationClient);
  useEffect(() => {
    if (!iModel) {
      return;
    }

    let disposed = false;
    void (async () => {
      await VersionCompare.manager?.stopComparison();

      setLoadingState("creating-viewstate");
      const viewCreator = new ViewCreator3d(iModel);
      const viewState = await viewCreator.createDefaultView();
      if (!disposed) {
        setLoadingState("loaded");
        UiFramework.setIModelConnection(iModel);
        UiFramework.setDefaultViewState(viewState);

        // Define the frontstage configuration object
        const mainFrontstageProps = {
          id: "MainFrontstageProvider",
          usage: StageUsage.General,
          contentGroupProps: {
            id: "MainFrontstageProviderContentGroup",
            layout: { id: "MainFrontstageProviderContentGroupLayout" },
            contents: [{
              id: "MainFrontstageProviderContentView",
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
            maxSizeSpec: Number.POSITIVE_INFINITY,
          },
        };
        // UiFramework.frontstages.addFrontstageProvider(new MainFrontstageProvider());
        UiFramework.frontstages.addFrontstage(FrontstageUtilities.createStandardFrontstage(mainFrontstageProps));
        UiItemsManager.register(new MainFrontstageItemsProvider());
        await UiFramework.frontstages.setActiveFrontstage("MainFrontstageProvider");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [iModel]);

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

/** Simple console log testing functions for feature tracking implementation */
const featureTrackingTesterFunctions: VersionCompareFeatureTracking = {
  trackVersionSelectorV2Usage: () => { console.log("trackVersionSelectorV2Usage"); },
  trackVersionSelectorUsage: () => { console.log("trackVersionSelectorUsage"); },
  trackPropertyComparisonUsage: () => { console.log("trackPropertyComparisonUsage"); },
  trackChangeReportGenerationUsage: () => { console.log("trackChangeReportGenerationUsage"); },
  trackAdvancedFiltersUsage: () => { console.log("trackAdvancedFiltersUsage"); },
};

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
    quantityFormatter: new QuantityFormatter("metric"),
  });
  const rpcParams: BentleyCloudRpcParams = usingLocalBackend
    ? {
      info: { title: "test-app-backend", version: "v1.0" },
      uriPrefix: `http://localhost:${localBackendPort}`,
    }
    : {
      info: { title: "imodel/rpc", version: "v4" },
      uriPrefix: applyUrlPrefix("https://api.bentley.com"),
    };

  BentleyCloudRpcManager.initializeClient(
    rpcParams,
    [IModelReadRpcInterface, IModelTileRpcInterface, PresentationRpcInterface, ChangesRpcInterface],
  );

  await Promise.all([
    UiCore.initialize(IModelApp.localization),
    Presentation.initialize({
      selection: {selectionStorage: getUnifiedSelectionStorage()}
    }),
    UiFramework.initialize(undefined),
  ]);

  // Example changes provider that uses ChangesRpcInterface to get changes from backend instead of service
  const changesProvider = async (startChangeset: ChangesetIdWithIndex, endChangeset: ChangesetIdWithIndex, iModelConnection: IModelConnection) => {
    const client = ChangesRpcInterface.getClient();
    // Relationships we want for categorizing changes driven by relationships
    const relationships: RelationshipClassWithDirection[] = [
      { className: "ElementDrivesElement", reverse: false },
      { className: "SpatialOrganizerHoldsSpatialElements", reverse: false },
    ];
    const instances = await client.getChangedInstances(iModelConnection.getRpcProps(), startChangeset, endChangeset, relationships, await authorizationClient.getAccessToken());

    // Change the driven by elements that are inserted or deleted as "updated"
    for (const instance of instances.changedInstances) {
      if (instance.$comparison.drivenBy !== undefined && (instance.$meta?.op === "Inserted" || instance.$meta?.op === "Deleted")) {
        // If the instance is inserted+deleted due to the domain logic, we mark it as updated
        instance.$meta.op = "Updated";
        // Add type of change as indirect
        instance.$comparison.type = instance.$comparison.type | TypeOfChange.Indirect;
        // TODO: Currently we maintain all changed instances in this example, but this will include the duplicate Insert and the Delete as separate entries. They should be consolidated
      }
    }

    return instances;
  }

  // Example color override provider for direct comparison changes
  const colorOverrideProvider = (visibleInstances: ChangedECInstance[], _hiddenInstances: ChangedECInstance[], overrides: FeatureSymbology.Overrides) => {
    // Override color for driven elements
    const drivenAppearance = FeatureAppearance.fromJSON({
      rgb: { r: 180, g: 120, b: 200 },
      emphasized: true,
    });
    // Colorize driven elements that are visible due to filters in the UI
    for (const change of visibleInstances) {
      if (change.$comparison?.drivenBy) {
        overrides.override({
          elementId: change.ECInstanceId,
          appearance: drivenAppearance,
        });
        overrides.setAlwaysDrawn(change.ECInstanceId);
      }
    }
  };

  // Example onInstancesSelected handler that can be used to perform custom actions when instances are selected in the UI
  const onInstancesSelected = async (instances: ChangedECInstance[]) => {
    console.log("Selected instances:", instances);
    // Here you can implement any custom logic when instances are selected in the UI
  };

  VersionCompare.initialize({
    changedElementsApiBaseUrl: applyUrlPrefix("https://api.bentley.com/changedelements"),
    getAccessToken: () => authorizationClient.getAccessToken(),
    wantReportGeneration: true,
    wantTooltipAugment: true,
    createVisualizationHandler: (manager) => new AppUiVisualizationHandler(
      manager,
      { frontstageIds: ["MainFrontstageProvider"] },
    ),
    featureTracking: featureTrackingTesterFunctions,
    changesProvider: useDirectComparison ? changesProvider : undefined,
    colorOverrideProvider: useDirectComparison ? colorOverrideProvider : undefined,
    onInstancesSelected: useDirectComparison ? onInstancesSelected : undefined,
  });

  ReducerRegistryInstance.registerReducer("versionCompareState", VersionCompareReducer);
  }

export type Toaster = ReturnType<typeof useToaster>;
function useIModel(
  iTwinId: string,
  iModelId: string,
  authorizationClient: AuthorizationClient,
): IModelConnection | undefined {
  const [iModel, setIModel] = useState<IModelConnection>();

  const toaster = useToaster();
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
          displayIModelError(IModelApp.localization.getLocalizedString("App:error:imodel-open-remote"), error, toaster);
        }
      })();

      return () => {
        disposed = true;
        void (async () => {
          const openedIModel = await iModelPromise;
          try {
            await openedIModel.close();
          } catch (error) {
            displayIModelError(IModelApp.localization.getLocalizedString("App:error:imodel-close-remote"), error, toaster);
          }
        })();
      };
    },
    [authorizationClient, iModelId, iTwinId, toaster],
  );

  return iModel;
}

function displayIModelError(message: string, error: unknown, toaster: Toaster): void {
  const errorMessage = (error && typeof error === "object") ? (error as { message: unknown; }).message : error;
  toaster.negative(<>{message}<br /> {errorMessage}</>);
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
        maxSizeSpec: Number.POSITIVE_INFINITY,
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
      stageId !== "MainFrontstageProvider" ||
      stageUsage !== StageUsage.General ||
      location !== StagePanelLocation.Right ||
      section !== StagePanelSection.Start
    ) {
      return [];
    }

    const iModel = UiFramework.getIModelConnection();
    if (!iModel) {
      return [];
    }

    if (runExperimental) {
      return [
        {
          id: "NamedVersionSelector",
          label: "NamedVersionSelector",
          content: (
            <NamedVersionSelectorWidget
              iModel={iModel}
              manager={VersionCompare.manager}
              manageVersions={<ManageNamedVersions />}
              feedbackUrl="https://example.com"
              documentationHref="https://example.com"
            />
          ),
        },
      ];
    } else {
      return [{
        id: "ChangedElementsWidget",
        content: <ChangedElementsWidget
          useV2Widget
          feedbackUrl="https://example.com"
          iModelConnection={UiFramework.getIModelConnection()!}
          enableComparisonJobUpdateToasts
          manageNamedVersionsSlot={<ManageNamedVersions />}
          documentationHref="https://example.com"
        />,
      }];
    }
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

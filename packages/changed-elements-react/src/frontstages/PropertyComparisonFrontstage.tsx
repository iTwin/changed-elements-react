/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { ContentLayoutProps, LayoutVerticalSplitProps } from "@itwin/appui-abstract";
import {
  ConfigurableUiManager, ContentGroup, ContentLayoutDef, ContentLayoutManager, Frontstage, FrontstageConfig,
  FrontstageManager, FrontstageProps, FrontstageProvider, StatusBarComposer, ToolItemDef, ViewToolWidgetComposer,
  type ContentProps
} from "@itwin/appui-react";
import { IModelApp, IModelConnection, ViewState } from "@itwin/core-frontend";
import * as React from "react";

import { VersionCompareManager } from "../api/VersionCompareManager.js";
import { PropertyComparisonTableControl } from "../contentviews/PropertyComparisonTable.js";
import { PropertyComparisonViewportControl } from "../contentviews/PropertyComparisonViewport.js";
import { DummyTool } from "../tools/DummyTool.js";
import {
  PropertyComparisonToolWidget, type ToolWidgetProps as PropertyCompareToolWidgetProps
} from "../widgets/PropertyComparisonToolWidget.js";
import "./PropertyComparisonFrontstage.scss";

/**
 * Frontstage with two viewports for showing current and target versions of an iModel
 * and the property comparison table content view
 * Can be given frontstage props via constructor to override/customize the zones
 */
export class PropertyComparisonFrontstage extends FrontstageProvider {
  public static readonly id = "VersionCompare_PropertyComparisonFrontstage";
  public id = PropertyComparisonFrontstage.id;
  public static readonly viewportContentId = "VersionCompare_PropertyComparisonFrontstageViewportContent";
  public static readonly propertyComparisonTableContentId = "VersionCompare_PropertyComparisonTableContent";

  public static readonly sideBySideLayoutId = "PropertyComparisonThreeTopStacked";
  public static readonly sideBySideLayoutGroupId = `${PropertyComparisonFrontstage.sideBySideLayoutId}_Group`;
  public static readonly primarySideLayoutId = `${PropertyComparisonFrontstage.sideBySideLayoutId}_Primary`;
  public static readonly secondarySideLayoutId = `${PropertyComparisonFrontstage.sideBySideLayoutId}_Secondary`;

  public static readonly overviewLayoutId = "PropertyComparisonTwoStacked";
  public static readonly overviewLayoutGroupId = `${PropertyComparisonFrontstage.overviewLayoutId}_Group`;

  private static _sideBySideLayoutDef: ContentLayoutDef;
  private static _overviewLayoutDef: ContentLayoutDef;

  private static _sideBySideContentGroup: ContentGroup;
  private static _overviewContentGroup: ContentGroup;

  /**
   * Constructor
   * @param manager Version Compare Manager Object
   * @param primaryIModel Current IModelConnection
   * @param secondaryIModel Target IModelConnection being compared against
   * @param getPrimaryViewState Function to retrieve the view state for the current iModel
   * @param getSecondaryViewState Function to retrieve the view state for the target iModel
   * @param mainFrontstageId Main Frontstage Id to return to
   * @param frontstageProps [optional] frontstage props to customize the property comparison frontstage
   */
  constructor(
    public manager: VersionCompareManager,
    public primaryIModel: IModelConnection,
    public secondaryIModel: IModelConnection,
    public getPrimaryViewState: () => ViewState,
    public getSecondaryViewState: () => ViewState,
    public mainFrontstageIds: Set<string>,
    public frontstageProps?: Partial<FrontstageConfig>,
    public propertyCompareToolWidgetProps?: PropertyCompareToolWidgetProps,
  ) {
    super();
    if (!ConfigurableUiManager.isControlRegistered(PropertyComparisonFrontstage.viewportContentId)) {
      ConfigurableUiManager.registerControl(
        PropertyComparisonFrontstage.viewportContentId,
        PropertyComparisonViewportControl,
      );
    }
    if (!ConfigurableUiManager.isControlRegistered(PropertyComparisonFrontstage.propertyComparisonTableContentId)) {
      ConfigurableUiManager.registerControl(
        PropertyComparisonFrontstage.propertyComparisonTableContentId,
        PropertyComparisonTableControl,
      );
    }

    // Add layouts for frontstage to content layout manager
    if (ContentLayoutManager.findLayout(PropertyComparisonFrontstage.sideBySideLayoutId) === undefined) {
      PropertyComparisonFrontstage._sideBySideLayoutDef = new ContentLayoutDef(
        PropertyComparisonFrontstage._sideBySideLayoutProps(),
      );
      ContentLayoutManager.addLayout(
        PropertyComparisonFrontstage.sideBySideLayoutId,
        PropertyComparisonFrontstage._sideBySideLayoutDef,
      );
    }

    if (ContentLayoutManager.findLayout(PropertyComparisonFrontstage.overviewLayoutId) === undefined) {
      PropertyComparisonFrontstage._overviewLayoutDef = new ContentLayoutDef(
        PropertyComparisonFrontstage._overviewLayoutProps(),
      );
      ContentLayoutManager.addLayout(
        PropertyComparisonFrontstage.overviewLayoutId,
        PropertyComparisonFrontstage._overviewLayoutDef,
      );
    }

    // Create content groups for both modes
    PropertyComparisonFrontstage._sideBySideContentGroup = new ContentGroup({
      id: PropertyComparisonFrontstage.sideBySideLayoutGroupId,
      layout: PropertyComparisonFrontstage._sideBySideLayoutProps(),
      contents: this._sideBySideContentProps(),
    });
    PropertyComparisonFrontstage._overviewContentGroup = new ContentGroup({
      id: PropertyComparisonFrontstage.overviewLayoutGroupId,
      layout: PropertyComparisonFrontstage._overviewLayoutProps(),
      contents: this._overviewContentProps(),
    });

    // Register dummy tool for no selection
    DummyTool.register(VersionCompareManager.namespace);

    FrontstageManager.onFrontstageReadyEvent.addListener(({ frontstageDef }) => {
      if (frontstageDef.id === PropertyComparisonFrontstage.id) {
        IModelApp.toolAdmin.defaultToolId = DummyTool.toolId;
        void IModelApp.toolAdmin.startDefaultTool();
      }
    });
  }

  /** Changes layout to a single view for "Side-by-Side" (dual viewport) comparison mode. */
  public static async changeToSideBySideLayout() {
    if (PropertyComparisonFrontstage._sideBySideContentGroup === undefined) {
      return;
    }

    await this._changeLayout(
      PropertyComparisonFrontstage.sideBySideLayoutId,
      PropertyComparisonFrontstage._sideBySideContentGroup,
    );
  }

  /** Changes layout to "overview" (single viewport) comparison mode. */
  public static async changeToOverviewLayout() {
    if (PropertyComparisonFrontstage._overviewContentGroup === undefined) {
      return;
    }

    await this._changeLayout(
      PropertyComparisonFrontstage.overviewLayoutId,
      PropertyComparisonFrontstage._overviewContentGroup,
    );
  }

  /** Returns true if we are in side by side mode. */
  public static get isSideBySide(): boolean {
    const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
    if (activeFrontstageDef === undefined || activeFrontstageDef.contentLayoutDef === undefined) {
      return false;
    }

    return activeFrontstageDef.contentLayoutDef.id === PropertyComparisonFrontstage.sideBySideLayoutId;
  }

  /** Returns true if we are in single viewport overview mode. */
  public static get isOverview(): boolean {
    const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
    if (activeFrontstageDef === undefined || activeFrontstageDef.contentLayoutDef === undefined) {
      return false;
    }

    return activeFrontstageDef.contentLayoutDef.id === PropertyComparisonFrontstage.overviewLayoutId;
  }

  /** Toggles layout of frontstage. */
  public static async toggleLayout() {
    if (PropertyComparisonFrontstage.isSideBySide) {
      await PropertyComparisonFrontstage.changeToOverviewLayout();
    } else {
      await PropertyComparisonFrontstage.changeToSideBySideLayout();
    }
  }

  /** Changes layout of frontstage. */
  private static async _changeLayout(id: string, contentGroup: ContentGroup) {
    const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
    if (activeFrontstageDef !== undefined && activeFrontstageDef.id === PropertyComparisonFrontstage.id) {
      const contentLayout = ContentLayoutManager.findLayout(id);
      if (contentLayout !== undefined) {
        await ContentLayoutManager.setActiveLayout(contentLayout, contentGroup);
      }
    }
  }

  /** Layout props for side by side mode. */
  private static _sideBySideLayoutProps = (): ContentLayoutProps => {
    const verticalSplit: LayoutVerticalSplitProps = {
      id: "PropertyComparisonThreeTopStacked.Top",
      percentage: 0.5,
      left: 0,
      right: 1,
      lock: true,
    };

    const sideBySideLayoutProps: ContentLayoutProps = {
      // Three Views, one on the left, two stacked on the right
      id: PropertyComparisonFrontstage.sideBySideLayoutId,
      description: IModelApp.localization.getLocalizedString("VersionCompare:ContentDef.ThreeTopStacked"),
      horizontalSplit: {
        id: "PropertyComparisonThreeTopStacked.MainHorizontal",
        percentage: 0.6,
        bottom: 2,
        minSizeTop: 200,
        minSizeBottom: 200,
        top: { verticalSplit },
      },
    };
    return sideBySideLayoutProps;
  };

  /** Layout props for overview mode. */
  private static _overviewLayoutProps = (): ContentLayoutProps => {
    return {
      // Two Content Views, one viewport top, table below
      id: PropertyComparisonFrontstage.overviewLayoutId,
      description: IModelApp.localization.getLocalizedString("VersionCompare:ContentDef.TwoStacked"),
      horizontalSplit: {
        id: "PropertyComparisonThreeTopStacked.MainHorizontal",
        percentage: 0.6,
        top: 0,
        bottom: 1,
        minSizeTop: 200,
        minSizeBottom: 200,
      },
    };
  };

  /** Content props for side by side comparison. */
  private _sideBySideContentProps = (): ContentProps[] => {
    const contentProps: ContentProps[] = [];
    contentProps.push({
      id: PropertyComparisonFrontstage.primarySideLayoutId,
      classId: PropertyComparisonFrontstage.viewportContentId,
      applicationData: {
        getViewState: this.getPrimaryViewState,
        iModelConnection: this.primaryIModel,
      },
    });

    contentProps.push({
      id: PropertyComparisonFrontstage.secondarySideLayoutId,
      classId: PropertyComparisonFrontstage.viewportContentId,
      applicationData: {
        getViewState: this.getSecondaryViewState,
        iModelConnection: this.secondaryIModel,
      },
    });

    const propertyComparisonTable: ContentProps = {
      id: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      classId: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      applicationData: { manager: this.manager },
    };
    contentProps.push(propertyComparisonTable);
    return contentProps;
  };

  /** Content props for overview comparison. */
  private _overviewContentProps = (): ContentProps[] => {
    const contentProps: ContentProps[] = [];
    contentProps.push({
      id: PropertyComparisonFrontstage.overviewLayoutId,
      classId: PropertyComparisonFrontstage.viewportContentId,
      applicationData: {
        getViewState: this.getPrimaryViewState,
        iModelConnection: this.primaryIModel,
      },
    });

    const propertyComparisonTable: ContentProps = {
      id: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      classId: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      applicationData: { manager: this.manager },
    };
    contentProps.push(propertyComparisonTable);
    return contentProps;
  };

  public override frontstageConfig(): FrontstageConfig {
    return {
      id: PropertyComparisonFrontstage.id,
      version: 0,
      contentGroup: PropertyComparisonFrontstage._sideBySideContentGroup,
      contentManipulation: {
        id: "PropertyComparisonToolWidget",
        element: <PropertyComparisonToolWidget {...this.propertyCompareToolWidgetProps} />,
      },
      statusBar: {
        id: "VersionCompareStatusBar",
        isStatusBar: true,
        element: <StatusBarComposer items={[]} />,
      },
      viewNavigation: {
        id: "ViewNavigation",
        element: <ViewToolWidgetComposer />,
      },
      ...this.frontstageProps,
    };
  }

  /** Frontstage props definition. */
  public get frontstage(): React.ReactElement<FrontstageProps> {
    // Register dummy tool for no selection
    DummyTool.register(VersionCompareManager.namespace);

    return (
      <Frontstage
        id={PropertyComparisonFrontstage.id}
        defaultTool={
          new ToolItemDef({
            toolId: DummyTool.toolId,
            execute: async () => IModelApp.tools.run(DummyTool.toolId),
          })
        }
        contentGroup={PropertyComparisonFrontstage._sideBySideContentGroup}
      />
    );
  }
}

/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import type { ContentLayoutProps, ContentProps, LayoutVerticalSplitProps } from "@itwin/appui-react";
import {
  ContentGroup,
  ContentLayoutDef,
  Frontstage,
  StatusBarComposer,
  UiFramework,
  ViewToolWidgetComposer
} from "@itwin/appui-react";
import { VersionCompareManager } from "@itwin/changed-elements-react";
import { IModelApp, type IModelConnection, type ViewState } from "@itwin/core-frontend";

import { DummyTool } from "./DummyTool.js";
import { PropertyComparisonTableContent } from "./PropertyComparisonTable.js";
import { PropertyComparisonToolWidget } from "./PropertyComparisonToolWidget.js";
import { PropertyComparisonViewportContent } from "./PropertyComparisonViewport.js";

import "./PropertyComparisonFrontstage.scss";

/**
 * Frontstage with two viewports for showing current and target versions of an iModel and the property comparison table
 * content view. Can be given frontstage props via constructor to override/customize the zones.
 */
export class PropertyComparisonFrontstage {
  public static readonly id = "VersionCompare_PropertyComparisonFrontstage";
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

  public id = PropertyComparisonFrontstage.id;

  /**
   * Constructor.
   * @param manager Version Compare Manager Object
   * @param primaryIModel Current IModelConnection
   * @param secondaryIModel Target IModelConnection being compared against
   * @param getPrimaryViewState Function to retrieve the view state for the current iModel
   * @param getSecondaryViewState Function to retrieve the view state for the target iModel
   */
  constructor(
    public manager: VersionCompareManager,
    public primaryIModel: IModelConnection,
    public secondaryIModel: IModelConnection,
    public getPrimaryViewState: () => ViewState,
    public getSecondaryViewState: () => ViewState,
  ) {
    // Add layouts for frontstage to content layout manager
    if (
      UiFramework.content.layouts.find(
        PropertyComparisonFrontstage.sideBySideLayoutId,
      ) === undefined
    ) {
      PropertyComparisonFrontstage._sideBySideLayoutDef = new ContentLayoutDef(
        PropertyComparisonFrontstage._sideBySideLayoutProps(),
      );
      UiFramework.content.layouts.add(
        PropertyComparisonFrontstage.sideBySideLayoutId,
        PropertyComparisonFrontstage._sideBySideLayoutDef,
      );
    }

    if (UiFramework.content.layouts.find(PropertyComparisonFrontstage.overviewLayoutId) === undefined) {
      PropertyComparisonFrontstage._overviewLayoutDef = new ContentLayoutDef(
        PropertyComparisonFrontstage._overviewLayoutProps(),
      );
      UiFramework.content.layouts.add(
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

    if (!UiFramework.frontstages.onFrontstageActivatedEvent.has(onFrontstageChanged)) {
      UiFramework.frontstages.onFrontstageActivatedEvent.addListener(onFrontstageChanged);
    }
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
    const activeFrontstageDef = UiFramework.frontstages.activeFrontstageDef;
    if (activeFrontstageDef === undefined || activeFrontstageDef.contentLayoutDef === undefined) {
      return false;
    }

    return activeFrontstageDef.contentLayoutDef.id === PropertyComparisonFrontstage.sideBySideLayoutId;
  }

  /** Returns true if we are in single viewport overview mode. */
  public static get isOverview(): boolean {
    const activeFrontstageDef = UiFramework.frontstages.activeFrontstageDef;
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
    const activeFrontstageDef = UiFramework.frontstages.activeFrontstageDef;
    if (activeFrontstageDef !== undefined && activeFrontstageDef.id === PropertyComparisonFrontstage.id) {
      const contentLayout = UiFramework.content.layouts.find(id);
      if (contentLayout !== undefined) {
        await UiFramework.content.layouts.setActive(contentLayout, contentGroup);
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
      content: <PropertyComparisonViewportContent getViewState={this.getPrimaryViewState} iModelConnection={this.primaryIModel} />,
    });

    contentProps.push({
      id: PropertyComparisonFrontstage.secondarySideLayoutId,
      classId: PropertyComparisonFrontstage.viewportContentId,
      content: <PropertyComparisonViewportContent getViewState={this.getSecondaryViewState} iModelConnection={this.secondaryIModel} />,
    });

    const propertyComparisonTable: ContentProps = {
      id: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      classId: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      content: <PropertyComparisonTableContent manager={this.manager} />,
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
      content: <PropertyComparisonViewportContent getViewState={this.getPrimaryViewState} iModelConnection={this.primaryIModel} />,
    });

    const propertyComparisonTable: ContentProps = {
      id: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      classId: PropertyComparisonFrontstage.propertyComparisonTableContentId,
      content: <PropertyComparisonTableContent manager={this.manager} />,
    };
    contentProps.push(propertyComparisonTable);
    return contentProps;
  };

  public frontstageConfig(): Frontstage {
    return {
      id: PropertyComparisonFrontstage.id,
      version: 0,
      contentGroup: PropertyComparisonFrontstage._sideBySideContentGroup,
      contentManipulation: {
        id: "PropertyComparisonToolWidget",
        content: <PropertyComparisonToolWidget />,
      },
      statusBar: {
        id: "VersionCompareStatusBar",
        content: <StatusBarComposer items={[]} />,
      },
      viewNavigation: {
        id: "ViewNavigation",
        content: <ViewToolWidgetComposer />,
      },
    };
  }
}

let originalDefaultToolId: string | undefined = undefined;
type FrontstageActivatedArgs = Parameters<Parameters<typeof UiFramework.frontstages.onFrontstageActivatedEvent.addListener>[0]>[0];
const onFrontstageChanged = async (args: FrontstageActivatedArgs): Promise<void> => {
  if (args.activatedFrontstageDef.id === PropertyComparisonFrontstage.id) {
    originalDefaultToolId = IModelApp.toolAdmin.defaultToolId;
    IModelApp.toolAdmin.defaultToolId = DummyTool.toolId;
    // Note: currently the defaultTool property of the frontstage config is not working properly,
    //   consequently the PropertyComparisonFrontstage will be set with the default select tool, which
    //   this handler overrides, but we must use setImmediate to let the other listeners finish running so that
    //   this default tool (DummyTool) as applied last. In practice without this the dummy tool is still active but
    //   the tool assistance will show the select tool instead of this blank tool in the status bar
    setTimeout(async () => {
      await IModelApp.toolAdmin.startDefaultTool();
    }, 0);
  }

  if (args.deactivatedFrontstageDef?.id === PropertyComparisonFrontstage.id) {
    if (originalDefaultToolId) {
      IModelApp.toolAdmin.defaultToolId = originalDefaultToolId;
      await IModelApp.toolAdmin.startDefaultTool();
    }
  }
}

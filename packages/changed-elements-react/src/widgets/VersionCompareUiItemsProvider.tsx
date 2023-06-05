/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  CommandItemDef, StagePanelLocation, StagePanelSection, StageUsage, StatusBarItem, StatusBarItemUtilities,
  StatusBarSection, ToolbarHelper, ToolbarItem, ToolbarOrientation, ToolbarUsage, UiFramework, UiItemsProvider, Widget
} from "@itwin/appui-react";
import { IModelApp } from "@itwin/core-frontend";

import { ChangedElementsWidget } from "./ChangedElementsWidget.js";
import { VersionCompareFooterWidget, type VersionCompareFooterWidgetProps } from "./VersionCompareFooterWidget.js";
import { openSelectDialog } from "./VersionCompareSelectWidget.js";

/**
 * Provide standard tools for Comments.
 * @public
 */
export class VersionCompareUiItemsProvider implements UiItemsProvider {
  public static readonly providerId = "VersionCompareUiItemsProvider";
  public readonly id = VersionCompareUiItemsProvider.providerId;

  public constructor(private props: VersionCompareFooterWidgetProps) { }

  public provideToolbarItems(
    _stageId: string,
    _stageUsage: string,
    toolbarUsage: ToolbarUsage,
    toolbarOrientation: ToolbarOrientation,
  ): ToolbarItem[] {
    if (
      toolbarUsage === ToolbarUsage.ContentManipulation &&
      toolbarOrientation === ToolbarOrientation.Vertical &&
      !this.props.excludeToolbarItem
    ) {
      const items: ToolbarItem[] = [];
      items.push(ToolbarHelper.createToolbarItemFromItemDef(500, this.createOpenSelectDialogItemDef));
      return items;
    }

    return [];
  }

  public provideStatusBarItems(_stageId: string, stageUsage: string): StatusBarItem[] {
    const statusBarItems: StatusBarItem[] = [];
    if (stageUsage === StageUsage.General) {
      statusBarItems.push(
        StatusBarItemUtilities.createCustomItem(
          "VersionCompare",
          StatusBarSection.Left,
          50,
          <VersionCompareFooterWidget {...this.props} />,
        ),
      );
    }

    return statusBarItems;
  }

  public provideWidgets(
    _stageId: string,
    stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection,
  ): Widget[] {
    if (
      stageUsage === StageUsage.General &&
      location === StagePanelLocation.Right &&
      section === StagePanelSection.Start
    ) {
      const widgets: Widget[] = [];
      widgets.push({
        id: ChangedElementsWidget.widgetId,
        label: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompare"),
        icon: "icon-compare",
        content: <ChangedElementsWidget />,
      });
      return widgets;
    }

    return [];
  }

  private get createOpenSelectDialogItemDef() {
    return new CommandItemDef({
      commandId: "VersionCompareSelectTool",
      iconSpec: "icon-compare",
      labelKey: "VersionCompare:versionCompare.versionCompareBeta",
      execute: async () => {
        const iModelConnection = UiFramework.getIModelConnection();
        if (iModelConnection) {
          await openSelectDialog(iModelConnection);
        }
      },
    });
  }
}

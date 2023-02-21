/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  StagePanelLocation, StagePanelSection, StageUsage, StatusBarSection, ToolbarOrientation, ToolbarUsage,
  type AbstractWidgetProps, type CommonStatusBarItem, type CommonToolbarItem, type UiItemsProvider
} from "@itwin/appui-abstract";
import {
  CommandItemDef, StatusBarItemUtilities, ToolbarHelper, UiFramework, withStatusFieldProps
} from "@itwin/appui-react";
import { IModelApp } from "@itwin/core-frontend";

import { ChangedElementsWidget } from "./ChangedElementsWidget";
import { VersionCompareFooterWidget, type VersionCompareFooterProps } from "./VersionCompareFooterWidget";
import { openSelectDialog } from "./VersionCompareSelectWidget";

/**
 * Provide standard tools for Comments.
 * @public
 */
export class VersionCompareUiItemsProvider implements UiItemsProvider {
  public static readonly providerId = "VersionCompareUiItemsProvider";
  public readonly id = VersionCompareUiItemsProvider.providerId;

  public constructor(private props: VersionCompareFooterProps) { }

  public provideToolbarButtonItems(
    _stageId: string,
    _stageUsage: string,
    toolbarUsage: ToolbarUsage,
    toolbarOrientation: ToolbarOrientation,
  ): CommonToolbarItem[] {
    if (
      toolbarUsage === ToolbarUsage.ContentManipulation &&
      toolbarOrientation === ToolbarOrientation.Vertical &&
      !this.props.excludeToolbarItem
    ) {
      const items: CommonToolbarItem[] = [];
      items.push(
        ToolbarHelper.createToolbarItemFromItemDef(
          500,
          this.createOpenSelectDialogItemDef,
        ),
      );
      return items;
    }

    return [];
  }

  public provideStatusBarItems(
    _stageId: string,
    stageUsage: string,
  ): CommonStatusBarItem[] {
    const statusBarItems: CommonStatusBarItem[] = [];
    if (stageUsage === StageUsage.General) {
      const WidgetWithProps = withStatusFieldProps(VersionCompareFooterWidget);
      statusBarItems.push(
        StatusBarItemUtilities.createStatusBarItem(
          "VersionCompare",
          StatusBarSection.Left,
          50,
          <WidgetWithProps {...this.props} />,
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
  ): AbstractWidgetProps[] {
    if (
      stageUsage === StageUsage.General &&
      location === StagePanelLocation.Right &&
      section === StagePanelSection.Start
    ) {
      const widgets: AbstractWidgetProps[] = [];
      widgets.push({
        id: ChangedElementsWidget.widgetId,
        label: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompare"),
        icon: "icon-compare",
        getWidgetContent: () => <ChangedElementsWidget />,
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
          await openSelectDialog(iModelConnection, this.props.onViewChanged);
        }
      },
    });
  }
}

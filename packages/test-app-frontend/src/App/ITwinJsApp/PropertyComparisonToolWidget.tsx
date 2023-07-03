/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ConditionalBooleanValue } from "@itwin/appui-abstract";
import {
  BackstageAppButton, CommandItemDef, HideIsolateEmphasizeActionHandler, SyncUiEventId, ToolbarComposer, ToolbarHelper,
  ToolbarItem, ToolbarOrientation, ToolbarUsage, ToolItemDef, ToolWidgetComposer, UiFramework
} from "@itwin/appui-react";
import { SideBySideVisualizationManager, VersionCompare } from "@itwin/changed-elements-react";
import { EmphasizeElements, IModelApp } from "@itwin/core-frontend";
import { Component, type ReactElement, type ReactNode } from "react";

import { PropertyComparisonFrontstage } from "./PropertyComparisonFrontstage.js";

import "./PropertyComparisonToolWidget.override.css";

export interface PropertyComparisonVisibilityClearToolProps {
  clearIsolate: () => void;
}

export function PropertyComparisonVisibilityClearTool(
  { clearIsolate }: PropertyComparisonVisibilityClearToolProps,
): ReactElement {
  const areElementDisplayOverridesActive = () => {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp) {
      return false;
    }

    const isolatedElements = EmphasizeElements.get(vp)?.getIsolatedElements(vp);
    return isolatedElements !== undefined && isolatedElements.size !== 0;
  };

  const clearIsolateToolCommand = new CommandItemDef({
    commandId: "VersionCompare.PropertyComparisonTools.ClearIsolate",
    iconSpec: "icon-visibility",
    isHidden: new ConditionalBooleanValue(
      () => !areElementDisplayOverridesActive(),
      [
        HideIsolateEmphasizeActionHandler.hideIsolateEmphasizeUiSyncId,
        SyncUiEventId.ActiveViewportChanged,
        SyncUiEventId.ViewStateChanged,
        SyncUiEventId.FeatureOverridesChanged,
        "visibilitycleartooloverridechanged",
      ],
    ),
    label: () => IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.clearIsolate"),
    execute: clearIsolate,
  });

  return (
    <ToolbarComposer
      items={[ToolbarHelper.createToolbarItemFromItemDef(0, clearIsolateToolCommand)]}
      usage={ToolbarUsage.ContentManipulation}
      orientation={ToolbarOrientation.Horizontal}
    />
  );
}

export interface ToolWidgetProps {
  /** Extra tools to add to the Property Comparison Tool Widget */
  verticalTools?: ToolbarItem[];
  /** Extra tools to add to the Property Comparison Tool Widget */
  horizontalTools?: ToolbarItem[];
  /** Vertical toolbar */
  verticalToolbar?: ReactNode;
  /** Horizontal Toolbar */
  horizontalToolbar?: ReactNode;
}

/**
 * Default tool widget for the property comparison frontstage
 * Contains measure tools and an isolate tool
 */
export class PropertyComparisonToolWidget extends Component<ToolWidgetProps> {
  private clearIsolate = async () => {
    // Setup correct color overrides
    if (VersionCompare.manager) {
      if (
        UiFramework.frontstages.activeFrontstageId === PropertyComparisonFrontstage.id &&
        VersionCompare.manager.currentIModel &&
        VersionCompare.manager.targetIModel
      ) {
        const hiliteSet =
          await SideBySideVisualizationManager.getHiliteElements(
            VersionCompare.manager.currentIModel,
            VersionCompare.manager.targetIModel,
          );
        const propertyVisualizationManager = VersionCompare.manager?.visualization?.getDualViewVisualizationManager();
        if (propertyVisualizationManager !== undefined) {
          await propertyVisualizationManager.emphasizeSet(hiliteSet);
        }
      }
    }
  };

  public override render() {
    const isolateSelected = () => {
      if (VersionCompare.manager?.currentIModel) {
        const elements = VersionCompare.manager?.currentIModel.selectionSet.elements;
        for (const vp of IModelApp.viewManager) {
          EmphasizeElements.getOrCreate(vp).isolateElements(elements, vp, true); // Hide all but selected elements
        }

        if (PropertyComparisonFrontstage.isSideBySide) {
          const propertyVisualizationManager = VersionCompare.manager?.visualization?.getDualViewVisualizationManager();
          if (propertyVisualizationManager) {
            propertyVisualizationManager.setupViewportsOverrides(true);
          }
        }
      }
    };

    const tools: ToolbarItem[] = [];
    const horizontalTools: ToolbarItem[] = [];

    tools.push(
      ToolbarHelper.createToolbarItemFromItemDef(
        0,
        new ToolItemDef(
          {
            toolId: "VersionCompare.IsolateSelected",
            iconSpec: "icon-isolate",
            label: IModelApp.localization.getLocalizedString("VersionCompare:tools.isolate"),
          },
          isolateSelected,
        ),
      ),
    );

    if (this.props.verticalTools !== undefined) {
      tools.push(...this.props.verticalTools);
    }

    if (this.props.horizontalTools !== undefined) {
      horizontalTools.push(...this.props.horizontalTools);
    }

    const verticalToolbar = this.props.verticalToolbar ?? (
      <ToolbarComposer
        orientation={ToolbarOrientation.Vertical}
        items={tools}
        usage={ToolbarUsage.ContentManipulation}
      />
    );

    const horizontalToolbar = this.props.horizontalToolbar ?? (
      <PropertyComparisonVisibilityClearTool clearIsolate={this.clearIsolate} />
    );

    return (
      <ToolWidgetComposer
        className="vc-reset-vertical-grid-area"
        cornerItem={
          <BackstageAppButton
            icon="icon-progress-backward"
            label={IModelApp.localization.getLocalizedString("UiFramework:commands.backToPreviousFrontstage")}
            execute={() => UiFramework.frontstages.closeNestedFrontstage()}
          />
        }
        verticalToolbar={verticalToolbar}
        horizontalToolbar={horizontalToolbar}
      />
    );
  }
}

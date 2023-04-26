/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  BackstageAppButton, CommandItemDef, CommonToolbarItem, ToolItemDef, ToolWidgetComposer, ToolbarComposer,
  ToolbarHelper, ToolbarOrientation, ToolbarUsage, UiFramework
} from "@itwin/appui-react";
import { EmphasizeElements, IModelApp, Viewport } from "@itwin/core-frontend";
import React, { useCallback, useEffect, useState } from "react";

import { SideBySideVisualizationManager } from "../api/SideBySideVisualizationManager.js";
import { VersionCompare } from "../api/VersionCompare.js";
import { PropertyComparisonFrontstage } from "../frontstages/PropertyComparisonFrontstage.js";

import "./PropertyComparisonToolWidget.override.css";

export interface PropertyComparisonVisibilityClearToolProps {
  clearIsolate: () => void;
}

export const PropertyComparisonVisibilityClearTool = ({ clearIsolate }: PropertyComparisonVisibilityClearToolProps) => {
  const [
    areElementDisplayOverridesActive,
    setAreElementDisplayOverridesActive,
  ] = useState(false);

  useEffect(() => {
    const onFeatureOverridesListener = (vp: Viewport) => {
      const isolatedElements =
        EmphasizeElements.get(vp)?.getIsolatedElements(vp);
      setAreElementDisplayOverridesActive(isolatedElements !== undefined && isolatedElements.size !== 0);
    };

    const listeners: (() => void)[] = [];
    if (IModelApp.viewManager) {
      for (const vp of IModelApp.viewManager) {
        listeners.push(vp.onFeatureOverridesChanged.addListener(onFeatureOverridesListener));
      }
    }

    return () => {
      listeners.forEach((listener) => listener());
    };
  }, [IModelApp.viewManager]);

  useEffect(() => {
    const onViewOpenListener = (vp: Viewport) => {
      vp.onFeatureOverridesChanged.addListener((vp: Viewport) => {
        const isolatedElements =
          EmphasizeElements.get(vp)?.getIsolatedElements(vp);
        setAreElementDisplayOverridesActive(isolatedElements !== undefined && isolatedElements.size !== 0);
      });
    };

    return IModelApp.viewManager?.onViewOpen.addListener(onViewOpenListener);
  }, [IModelApp.viewManager]);

  const executeClearIsolate = useCallback(() => {
    clearIsolate();
    setAreElementDisplayOverridesActive(false);
  }, []);

  const clearIsolateToolCommand = new CommandItemDef({
    commandId: "VersionCompare.PropertyComparisonTools.ClearIsolate",
    iconSpec: "icon-visibility",
    isHidden: !areElementDisplayOverridesActive,
    label: () => IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.clearIsolate"),
    execute: executeClearIsolate,
  });

  return (
    <>
      {areElementDisplayOverridesActive && (
        <ToolbarComposer
          items={[ToolbarHelper.createToolbarItemFromItemDef(0, clearIsolateToolCommand)]}
          usage={ToolbarUsage.ContentManipulation}
          orientation={ToolbarOrientation.Horizontal}
        />
      )}
    </>
  );
};

export interface ToolWidgetProps {
  /** Extra tools to add to the Property Comparison Tool Widget */
  verticalTools?: CommonToolbarItem[];
  /** Extra tools to add to the Property Comparison Tool Widget */
  horizontalTools?: CommonToolbarItem[];
  /** Vertical toolbar */
  verticalToolbar?: React.ReactNode;
  /** Horizontal Toolbar */
  horizontalToolbar?: React.ReactNode;
}

/**
 * Default tool widget for the property comparison frontstage
 * Contains measure tools and an isolate tool
 */
export class PropertyComparisonToolWidget extends React.Component<ToolWidgetProps> {
  public override render() {
    const isolateSelected = () => {
      if (VersionCompare.manager?.currentIModel) {
        const elements =
          VersionCompare.manager?.currentIModel.selectionSet.elements;
        for (const vp of IModelApp.viewManager) {
          EmphasizeElements.getOrCreate(vp).isolateElements(elements, vp, true); // Hide all but selected elements
        }
        if (PropertyComparisonFrontstage.isSideBySide) {
          const propertyVisualizationManager =
            VersionCompare.manager?.visualization?.getDualViewVisualizationManager();
          if (propertyVisualizationManager) {
            propertyVisualizationManager.setupViewportsOverrides(true);
          }
        }
      }
    };
    const clearIsolate = async () => {
      // Setup correct color overrides
      if (VersionCompare.manager) {
        const frontstageIds = new Set(VersionCompare.manager.options.ninezoneOptions?.frontstageIds ?? []);
        if (frontstageIds.has(UiFramework.frontstages.activeFrontstageId)) {
          const visualizationManager =
            VersionCompare.manager?.visualization?.getSingleViewVisualizationManager();
          if (visualizationManager !== undefined) {
            await visualizationManager.resetDisplay();
          }
        } else if (
          UiFramework.frontstages.activeFrontstageId === PropertyComparisonFrontstage.id &&
          VersionCompare.manager.currentIModel &&
          VersionCompare.manager.targetIModel
        ) {
          const hiliteSet =
            await SideBySideVisualizationManager.getHiliteElements(
              VersionCompare.manager.currentIModel,
              VersionCompare.manager.targetIModel,
            );
          const propertyVisualizationManager =
            VersionCompare.manager?.visualization?.getDualViewVisualizationManager();
          if (propertyVisualizationManager !== undefined) {
            await propertyVisualizationManager.emphasizeSet(hiliteSet);
          }
        }
      }
    };

    const tools: CommonToolbarItem[] = [];
    const horizontalTools: CommonToolbarItem[] = [];

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
      <>
        <PropertyComparisonVisibilityClearTool clearIsolate={clearIsolate} />
        {horizontalTools.length !== 0 && (
          <ToolbarComposer
            orientation={ToolbarOrientation.Horizontal}
            items={horizontalTools}
            usage={ToolbarUsage.ContentManipulation}
          />
        )}
      </>
    );

    return (
      <ToolWidgetComposer
        className="vc-reset-vertical-grid-area"
        cornerItem={
          <BackstageAppButton
            icon="icon-progress-backward"
            label={IModelApp.localization.getLocalizedString("UiFramefork:commands.backToPreviousFrontstage")}
            execute={() => UiFramework.frontstages.closeNestedFrontstage()}
          />
        }
        verticalToolbar={verticalToolbar}
        horizontalToolbar={horizontalToolbar}
      />
    );
  }
}

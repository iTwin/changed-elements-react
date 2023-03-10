/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Direction, Toolbar } from "@itwin/appui-layout-react";
import {
  ActionItemButton, CommandItemDef, FrontstageManager, NestedFrontstage, ToolButton, ToolWidget
} from "@itwin/appui-react";
import { EmphasizeElements, IModelApp, Viewport } from "@itwin/core-frontend";
import React, { useCallback, useEffect, useState } from "react";

import { SideBySideVisualizationManager } from "../api/SideBySideVisualizationManager.js";
import { VersionCompare } from "../api/VersionCompare.js";
import { PropertyComparisonFrontstage } from "../frontstages/PropertyComparisonFrontstage.js";
import "./PropertyComparisonToolWidget.override.css";

export interface PropertyComparisonVisibilityClearToolProps {
  clearIsolate: () => void;
  className?: string;
}

export const PropertyComparisonVisibilityClearTool = ({
  clearIsolate,
  className,
}: PropertyComparisonVisibilityClearToolProps) => {
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
    isVisible: areElementDisplayOverridesActive,
    label: () => IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.clearIsolate"),
    execute: executeClearIsolate,
  });

  return (
    <>
      {areElementDisplayOverridesActive && (
        <Toolbar
          className={className}
          items={
            <>
              <ActionItemButton actionItem={clearIsolateToolCommand} />
            </>
          }
        />
      )}
    </>
  );
};

export interface ToolWidgetProps {
  /** Extra tools to add to the Property Comparison Tool Widget */
  verticalTools?: JSX.Element[];
  /** Extra tools to add to the Property Comparison Tool Widget */
  horizontalTools?: JSX.Element[];
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
        if (frontstageIds.has(FrontstageManager.activeFrontstageId)) {
          const visualizationManager =
            VersionCompare.manager?.visualization?.getSingleViewVisualizationManager();
          if (visualizationManager !== undefined) {
            await visualizationManager.resetDisplay();
          }
        } else if (
          FrontstageManager.activeFrontstageId ===
          PropertyComparisonFrontstage.id &&
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

    const tools: JSX.Element[] = [];
    const horizontalTools: JSX.Element[] = [];

    tools.push(
      <ToolButton
        toolId="VersionCompare.IsolateSelected"
        iconSpec="icon-isolate"
        label={IModelApp.localization.getLocalizedString("VersionCompare:tools.isolate")}
        execute={isolateSelected}
      />,
    );

    if (this.props.verticalTools !== undefined) {
      tools.push(...this.props.verticalTools);
    }

    if (this.props.horizontalTools !== undefined) {
      horizontalTools.push(...this.props.horizontalTools);
    }

    const verticalToolbar = this.props.verticalToolbar ?? (
      <Toolbar expandsTo={Direction.Right} items={tools} />
    );

    const horizontalToolbar = this.props.horizontalToolbar ?? (
      <>
        <PropertyComparisonVisibilityClearTool clearIsolate={clearIsolate} />
        {horizontalTools.length !== 0 && (
          <Toolbar expandsTo={Direction.Bottom} items={horizontalTools} />
        )}
      </>
    );

    return (
      <div>
        <ToolWidget
          className="vc-reset-vertical-grid-area"
          appButton={NestedFrontstage.backToPreviousFrontstageCommand}
          verticalToolbar={verticalToolbar}
          horizontalToolbar={horizontalToolbar}
        />
      </div>
    );
  }
}

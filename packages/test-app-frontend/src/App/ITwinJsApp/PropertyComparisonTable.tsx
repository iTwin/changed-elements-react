/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ConfigurableCreateInfo, ContentControl, UiFramework } from "@itwin/appui-react";
import {
  PropertyComparisonTable, updateVersionComparisonTransparencies, type PropertyComparisonTableProps,
  type VersionCompareManager, type VersionCompareState
} from "@itwin/changed-elements-react";
import { connect } from "react-redux";
import { IModelApp } from "@itwin/core-frontend";

import { PropertyComparisonFrontstage } from "./PropertyComparisonFrontstage";

export interface PropertyComparisonTableControlOptions {
  manager?: VersionCompareManager | undefined;
}

export class PropertyComparisonTableControl extends ContentControl {
  constructor(info: ConfigurableCreateInfo, options: PropertyComparisonTableControlOptions) {
    super(info, options);

    if (options.manager === undefined) {
      throw new Error(
        "Property Comparison Table Control should be passed a VersionCompareManager object as application Data (applicationData.manager)",
      );
    }

    this.reactNode = <ConnectedPropertyComparisonTable manager={options.manager} />;
  }
}

const ConnectedPropertyComparisonTable = connect(mapStateToProps)(PropertyComparisonTable);

function mapStateToProps(
  state: { versionCompareState: VersionCompareState; },
  ownProps: PropertyComparisonTableProps,
): PropertyComparisonTableProps {
  const manager = ownProps.manager;
  const selection = state.versionCompareState.selection;

  const handleSideBySideToggle = async () => {
    // toggleLayout() will cause current component to unmount and re-mount
    await PropertyComparisonFrontstage.toggleLayout();

    const activeFrontstageDef = UiFramework.frontstages.activeFrontstageDef;
    if (activeFrontstageDef?.id !== PropertyComparisonFrontstage.id) {
      return;
    }

    if (PropertyComparisonFrontstage.isOverview) {
      await manager.enableVisualization(true, selection);

      // Set transparency to center since slider starts in center
      const vp = IModelApp.viewManager.getFirstOpenView();
      if (vp) {
        updateVersionComparisonTransparencies(vp, 0.5, 0.5);
      }
    } else if (PropertyComparisonFrontstage.isSideBySide) {
      await manager.enableSideBySideVisualization();
    }
  };

  return {
    manager,
    selection,
    isSideBySide: PropertyComparisonFrontstage.isSideBySide,
    onSideBySideToggle: handleSideBySideToggle,
  };
}

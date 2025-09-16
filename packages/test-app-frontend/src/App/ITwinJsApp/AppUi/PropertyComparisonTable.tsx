/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { UiFramework } from "@itwin/appui-react";
import {
  PropertyComparisonTable,
  updateVersionComparisonTransparencies,
  type PropertyComparisonTableProps,
  type VersionCompareManager
} from "@itwin/changed-elements-react";
import { connect } from "react-redux";

import { PropertyComparisonFrontstage } from "./PropertyComparisonFrontstage.js";
import { type VersionCompareState } from "./redux/VersionCompareStore.js";
import { VersionCompareFrontstageManager } from "./VersionCompareFrontstageManager.js";

export interface PropertyComparisonTableControlOptions {
  manager?: VersionCompareManager | undefined;
}

export interface PropertyComparisonTableContentProps {
  manager?: VersionCompareManager | undefined;
}

export function PropertyComparisonTableContent(props: PropertyComparisonTableContentProps) {
  if (props.manager === undefined) {
    throw new Error(
      "Property Comparison Table Control should be passed a VersionCompareManager object as application Data (applicationData.manager)",
    );
  }

  return <ConnectedPropertyComparisonTable manager={props.manager} />;
}

const ConnectedPropertyComparisonTable = connect(mapStateToProps)(PropertyComparisonTable);

function mapStateToProps(state: { versionCompareState: VersionCompareState; }, ownProps: PropertyComparisonTableProps): PropertyComparisonTableProps {
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
      // Set transparency to center since slider starts in center
      await VersionCompareFrontstageManager.onViewPortMounts(
        1,
        async (viewports) => {
          await manager.enableVisualization(true, selection);
          updateVersionComparisonTransparencies(viewports[0], 0.5, 0.5);
        },
        10000,
      );
    } else if (PropertyComparisonFrontstage.isSideBySide) {
      await VersionCompareFrontstageManager.onViewPortMounts(
        2,
        async () => {
          await manager.enableSideBySideVisualization();
        },
        10000,
      );
    }
  };

  return {
    manager,
    selection,
    isSideBySide: PropertyComparisonFrontstage.isSideBySide,
    onSideBySideToggle: handleSideBySideToggle,
  };
}

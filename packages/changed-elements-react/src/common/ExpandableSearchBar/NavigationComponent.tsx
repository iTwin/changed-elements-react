/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { SvgChevronDown, SvgChevronUp } from "@itwin/itwinui-icons-react";
import { IconButton } from "@itwin/itwinui-react";

import "./NavigationComponent.scss";

export interface NavigationComponentProps {
  /**
   * Modify size of the navigation component.
   */
  size?: "small" | "large";
  /**
   * Callback to currently selected result/entry change.
   */
  onCurrentSelectionChanged?: (index: number) => void;
  /**
   * Current result (one based)
   * default is 0
   */
  currentResult?: number;
  /**
   * Total number of results/entries.
   * default is 0
   */
  resultCount?: number;
}

/** Navigation component (previous/next buttons) */
export const NavigationComponent = ({
  onCurrentSelectionChanged,
  currentResult = 0,
  resultCount = 0,
  size,
}: NavigationComponentProps) => {
  const onPrevClick = () => {
    if (currentResult > 1) {
      onCurrentSelectionChanged?.(currentResult - 1);
    }
  };

  const onNextClick = () => {
    if (currentResult < resultCount) {
      onCurrentSelectionChanged?.(currentResult + 1);
    }
  };

  const showCount = resultCount > 0;
  const isPrevEnabled = currentResult > 1 && resultCount !== 0;
  const isNextEnabled = currentResult < resultCount;

  return (
    <div className="navigation-component">
      {showCount && <span>{`${currentResult}/${resultCount}`}</span>}
      <div className="navigation-component-separator" />
      <IconButton
        size={size}
        styleType="borderless"
        disabled={!isPrevEnabled}
        onClick={onPrevClick}
        title={IModelApp.localization.getLocalizedString("VersionCompare:expandableSearchBar.previous")}
      >
        <SvgChevronUp />
      </IconButton>
      <IconButton
        size={size}
        styleType="borderless"
        disabled={!isNextEnabled}
        onClick={onNextClick}
        title={IModelApp.localization.getLocalizedString("VersionCompare:expandableSearchBar.next")}
      >
        <SvgChevronDown />
      </IconButton>
    </div>
  );
};

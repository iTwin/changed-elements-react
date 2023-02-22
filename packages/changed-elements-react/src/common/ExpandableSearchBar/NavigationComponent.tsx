/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgChevronDown, SvgChevronUp } from "@itwin/itwinui-icons-react";
import { IconButton } from "@itwin/itwinui-react";

import "./NavigationComponent.scss";

export type NavigationComponentTranslation = {
  previous: string;
  next: string;
};

const defaultStrings: NavigationComponentTranslation = {
  previous: "Previous",
  next: "Next",
};

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
  /**
   * Localized strings used in buttons.
   */
  translatedLabels?: NavigationComponentTranslation;
}

/** Navigation component (previous/next buttons) */
export const NavigationComponent = ({
  onCurrentSelectionChanged,
  currentResult = 0,
  resultCount = 0,
  size,
  translatedLabels,
}: NavigationComponentProps) => {
  const translatedStrings = { ...defaultStrings, ...translatedLabels };

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
        title={translatedStrings.previous}
      >
        <SvgChevronUp />
      </IconButton>
      <IconButton
        size={size}
        styleType="borderless"
        disabled={!isNextEnabled}
        onClick={onNextClick}
        title={translatedStrings.next}
      >
        <SvgChevronDown />
      </IconButton>
    </div>
  );
};

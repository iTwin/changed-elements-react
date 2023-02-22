/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgClose } from "@itwin/itwinui-icons-react";
import { IconButton } from "@itwin/itwinui-react";
import React from "react";

import "./FilterBar.scss";

export type FilterBarTranslation = {
  clear: string;
};

const defaultStrings: FilterBarTranslation = {
  clear: "Clear",
};
export interface FilterBarProps {
  /**
   * Modify size of the filter bar.
   */
  size?: "small" | "large";
  /**
   * Text displayed in the filter bar.
   */
  text: string;
  /**
   * On click handler when the text is clicked.
   */
  onTextClick?: () => void;
  /**
   * On click handler when the clear button is clicked.
   */
  onCloseClick?: () => void;
  /**
   * Localized strings used in buttons.
   */
  translatedLabels?: FilterBarTranslation;
}

export const FilterBar = ({
  onTextClick,
  onCloseClick,
  size,
  text,
  translatedLabels,
}: FilterBarProps) => {
  const translatedStrings = { ...defaultStrings, ...translatedLabels };
  return (
    <div
      role="button"
      tabIndex={0}
      className="search-bar-filter-bar"
      onClick={onTextClick}
      onKeyPress={onTextClick}
    >
      <span className={onTextClick ? "selectable" : ""}>{text}</span>
      <IconButton
        id="search-bar-filter-close"
        size={size}
        styleType="borderless"
        onClick={(event: React.MouseEvent) => {
          event.stopPropagation();
          onCloseClick?.();
        }}
        title={translatedStrings.clear}
      >
        <SvgClose />
      </IconButton>
    </div>
  );
};

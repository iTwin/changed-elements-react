/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { SvgClose } from "@itwin/itwinui-icons-react";
import { IconButton } from "@itwin/itwinui-react";
import { type ReactElement } from "react";

import "./FilterBar.scss";

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
}

export function FilterBar({
  onTextClick,
  onCloseClick,
  size,
  text,
}: FilterBarProps): ReactElement {
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
        title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.clear")}
      >
        <SvgClose />
      </IconButton>
    </div>
  );
}

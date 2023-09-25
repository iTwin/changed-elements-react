/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import { SvgBlank, SvgClose, SvgSearch } from "@itwin/itwinui-icons-react";
import { IconButton, Input } from "@itwin/itwinui-react";
import {
  useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement, type ReactNode
} from "react";

import { FilterBar } from "./FilterBar.js";

import "./ExpandableSearchBar.scss";

export interface ExpandableSearchBarProps {
  /** Modify size of the search button. */
  size?: "small" | "large";

  /**
   * Style of the button.
   * Use 'borderless' to hide outline.
   * @default 'default'
   */
  styleType?: "cta" | "high-visibility" | "default" | "borderless";

  /** Items on the left (replaced by the expanded search box). */
  children: ReactNode;

  /** Searchbox frequency to poll for changes in value (milliseconds). */
  valueChangedDelay?: number;

  /**
   * Set focus on input element when expanded.
   * @default false
   */
  setFocus?: boolean;

  /** On search text change handler. */
  onChange?: (searchText: string) => void;
}

/**
 * Display content to the left of the expanding search button. Handles expanding search box when search is clicked.
 *
 * @example
 * <ExpandableSearchButton>
 *   <IconButton>
 *     <SvgAdd />
 *   </IconButton>
 *   <IconButton>
 *     <SvgEdit />
 *   </IconButton>
 * </ExpandableSearchButton>
 */

/** SearchBox with expanding search box capability. */
export function ExpandableSearchBar({
  size,
  styleType,
  children,
  valueChangedDelay,
  onChange,
  setFocus = false,
}: ExpandableSearchBarProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [searchText, setSearchText] = useState<string>();
  const [timeoutId, setTimeoutId] = useState(0);
  const inputElement = useRef<HTMLInputElement>(null);

  const onClearSearch = () => {
    setSearchText("");
    onChange?.("");
  };

  const onToggleSearch = useCallback(
    () => {
      const expand = !expanded;
      setExpanded(expand);
    },
    [expanded],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onToggleSearch();
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    setSearchText(value);
    if (valueChangedDelay) {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      const id = window.setTimeout(() => {
        onChange?.(value);
      }, valueChangedDelay);
      setTimeoutId(id);
    } else {
      onChange?.(value);
    }
  };

  // Call focus() when search is expanded
  useEffect(
    () => {
      if (setFocus && expanded) {
        inputElement.current?.focus();
      }
    },
    [setFocus, expanded],
  );

  return (
    <div className="iTwinChangedElements__expandable-search-bar">
      <div className="iTwinChangedElements__expandable-search-bar-container">
        {children}
        <div className={`iTwinChangedElements__expandable-search-bar-wrapper ${expanded ? "expanded" : ""}`}>
          <Input
            size={size}
            value={searchText ?? ""}
            ref={inputElement}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.search")}
          />
          <IconButton size={size} styleType={styleType}>
            <SvgBlank />
          </IconButton>
        </div>
        <IconButton
          className="iTwinChangedElements__expandable-search-bar-icon-wrapper"
          size={size}
          styleType={styleType}
          onClick={onToggleSearch}
          title={IModelApp.localization.getLocalizedString(
            expanded ? "VersionCompare:versionCompare.closeSearchBar" : "VersionCompare:versionCompare.search",
          )}
        >
          {expanded ? <SvgClose /> : <SvgSearch />}
        </IconButton>
      </div>
      {
        !expanded && searchText && searchText.length > 0 &&
        <FilterBar text={`\`${searchText}\``} onCloseClick={onClearSearch} onTextClick={onToggleSearch} />
      }
    </div>
  );
}

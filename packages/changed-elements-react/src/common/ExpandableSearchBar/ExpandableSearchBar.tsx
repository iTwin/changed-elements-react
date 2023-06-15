/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp } from "@itwin/core-frontend";
import type { CommonProps } from "@itwin/core-react";
import { SvgBlank, SvgClose, SvgSearch } from "@itwin/itwinui-icons-react";
import { IconButton, Input, ProgressRadial } from "@itwin/itwinui-react";
import {
  useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement, type ReactNode
} from "react";

import { FilterBar } from "./FilterBar.js";
import { NavigationComponent } from "./NavigationComponent.js";

import "./ExpandableSearchBar.scss";

export interface ExpandableSearchBarProps extends CommonProps {
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

  /** Search value. */
  value?: string;

  /**
   * Show the search box in its expanded state.
   * @default false
   */
  isExpanded?: boolean;

  /** Searchbox frequency to poll for changes in value (milliseconds). */
  valueChangedDelay?: number;

  /** Placeholder value to show in gray before anything is entered in. */
  placeholder?: string;

  /**
   * Set focus on input element when expanded.
   * @default false
   */
  setFocus?: boolean;

  /**
   * Show or hide a loading spinner.
   * @default false
   */
  isLoading?: boolean;

  /** On search text change handler. */
  onChange?: (searchText: string) => void;

  /** Callback function on expansion state change. */
  onExpandedChange?: (expanded: boolean) => void;

  /**
   * Show prev/next navigation buttons.
   * @default false
   */
  enableNavigation?: boolean;

  /**
   * Show filter bar when a filter is active.
   * @default false
   */
  enableFilterBar?: boolean;

  /**
   * Current result (one based).
   * @default 0
   */
  currentResult?: number;

  /** If `enableNavigation` is specified, Total number of results/entries. */
  resultCount?: number;

  /** If `enableNavigation` is specified, on selected result/entry change handler. */
  onCurrentSelectionChanged?: (index: number) => void;

  /** If `isSearchHidden` is set to true, hides the search bar icon. */
  isSearchHidden?: boolean;
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
  className,
  value,
  valueChangedDelay,
  placeholder,
  currentResult = 0,
  resultCount = 0,
  onChange,
  onCurrentSelectionChanged,
  onExpandedChange,
  isLoading = false,
  isExpanded = false,
  setFocus = false,
  enableNavigation = false,
  enableFilterBar = false,
  isSearchHidden = false,
}: ExpandableSearchBarProps): ReactElement {
  const [expanded, setExpanded] = useState(isExpanded);
  const [searchText, setSearchText] = useState(value);
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
      onExpandedChange?.(expand);
    },
    [onExpandedChange, expanded],
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

  useEffect(() => { setSearchText(value); }, [value]);

  useEffect(() => { setExpanded(isExpanded); }, [isExpanded]);

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
    <div className={`expandable-search-bar ${className ?? ""}`}>
      <div className="expandable-search-bar-container">
        {children}
        <div className={`expandable-search-bar-wrapper ${expanded ? "expanded" : ""}`}>
          <Input
            size={size}
            value={searchText ?? ""}
            ref={inputElement}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={
              placeholder ?? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.search")
            }
          />
          {isLoading && <ProgressRadial className="expandable-search-bar-spinner" indeterminate />}
          {
            enableNavigation &&
            <NavigationComponent
              size={size}
              currentResult={currentResult}
              resultCount={resultCount}
              onCurrentSelectionChanged={onCurrentSelectionChanged}
            />
          }
          <IconButton size={size} styleType={styleType}>
            <SvgBlank />
          </IconButton>
        </div>
        {
          !isSearchHidden &&
          <IconButton
            className="expandable-search-bar-icon-wrapper"
            size={size}
            styleType={styleType}
            onClick={onToggleSearch}
            title={IModelApp.localization.getLocalizedString(
              expanded
                ? "VersionCompare:versionCompare.closeSearchBar"
                : "VersionCompare:versionCompare.search",
            )}
          >
            {expanded ? <SvgClose /> : <SvgSearch />}
          </IconButton>
        }
      </div>
      {
        enableFilterBar && !expanded && searchText && searchText.length > 0 &&
        <FilterBar text={`\`${searchText}\``} onCloseClick={onClearSearch} onTextClick={onToggleSearch} />
      }
    </div>
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ExpandableSearchBar.css";
import { ReactElement, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Localization } from "@itwin/core-common";
import { SvgBlank, SvgChevronDown, SvgChevronUp, SvgClose, SvgSearch } from "@itwin/itwinui-icons-react";
import { IconButton, Input } from "@itwin/itwinui-react";

export interface ExpandableSearchBarProps {
  localization: Localization;

  /** Modify size of the search button. */
  size?: "small" | "large";

  /**
   * Style of the button. Use 'borderless' to hide outline.
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
export function ExpandableSearchBar(props: ExpandableSearchBarProps): ReactElement {
  const [expanded, setExpanded] = useState(props.isExpanded ?? false);
  const [searchText, setSearchText] = useState(props.value);
  const [timeoutId, setTimeoutId] = useState(0);
  const inputElement = useRef<HTMLInputElement>(null);

  const onClearSearch = () => {
    setSearchText("");
    props.onChange?.("");
  };

  const onToggleSearch = useCallback(
    () => {
      const expand = !expanded;
      setExpanded(expand);
      props.onExpandedChange?.(expand);
    },
    [props.onExpandedChange, expanded],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onToggleSearch();
    }
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    setSearchText(value);
    if (props.valueChangedDelay) {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      const id = window.setTimeout(() => props.onChange?.(value), props.valueChangedDelay);
      setTimeoutId(id);
    } else {
      props.onChange?.(value);
    }
  };

  useEffect(() => { setSearchText(props.value); }, [props.value]);
  useEffect(() => { setExpanded(props.isExpanded ?? false); }, [props.isExpanded]);

  // call focus() when search is expanded
  useEffect(
    () => {
      if (props.setFocus && expanded) {
        inputElement.current?.focus();
      }
    },
    [props.setFocus, expanded],
  );

  return (
    <div className="itwin-changed-elements-react__expandable-search-bar">
      <div className="itwin-changed-elements-react__expandable-search-bar-container">
        {props.children}
        <div className="itwin-changed-elements-react__expandable-search-bar-wrapper" data-expanded={expanded}>
          <Input
            size={props.size}
            value={searchText ?? ""}
            ref={inputElement}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={props.placeholder ?? props.localization.getLocalizedString("VersionCompare:searchBar.search")}
          />
          {
            props.enableNavigation &&
            <NavigationComponent
              localization={props.localization}
              size={props.size}
              currentResult={props.currentResult}
              resultCount={props.resultCount}
              onCurrentSelectionChanged={props.onCurrentSelectionChanged}
            />
          }
          <IconButton size={props.size} styleType={props.styleType}>
            <SvgBlank />
          </IconButton>
        </div>
        <IconButton
          className="itwin-changed-elements-react__expandable-search-bar-icon-wrapper"
          size={props.size}
          styleType={props.styleType}
          onClick={onToggleSearch}
          title={props.localization.getLocalizedString(
            expanded ? "VersionCompare:searchBar.closeSearchBar" : "VersionCompare:searchBar.search",
          )}
        >
          {expanded ? <SvgClose /> : <SvgSearch />}
        </IconButton>
      </div>
      {
        props.enableFilterBar && !expanded && searchText && searchText.length > 0 &&
        <FilterBar
          localization={props.localization}
          text={`${props.localization.getLocalizedString("VersionCompare:searchBar.searchFor")} \`${searchText}\``}
          size={props.size}
          onCloseClick={onClearSearch}
          onTextClick={onToggleSearch}
        />
      }
    </div>
  );
}

interface NavigationComponentProps {
  localization: Localization;

  /** Modify size of the navigation component. */
  size?: "small" | "large";

  /** Callback to currently selected result/entry change. */
  onCurrentSelectionChanged?: (index: number) => void;

  /**
   * Current result (one based).
   * @default 0
   */
  currentResult?: number;

  /**
   * Total number of results/entries.
   * @default 0
   */
  resultCount?: number;
}

/** Navigation component (previous/next buttons). */
function NavigationComponent(props: NavigationComponentProps): ReactElement {
  const currentResult = props.currentResult ?? 0;
  const resultCount = props.resultCount ?? 0;

  const onPrevClick = () => {
    if (currentResult > 1) {
      props.onCurrentSelectionChanged?.(currentResult - 1);
    }
  };

  const onNextClick = () => {
    if (currentResult < resultCount) {
      props.onCurrentSelectionChanged?.(currentResult + 1);
    }
  };

  const showCount = resultCount > 0;
  const isPrevEnabled = currentResult > 1;
  const isNextEnabled = currentResult < resultCount;

  return (
    <div className="navigation-component">
      {showCount && <span>{`${currentResult}/${resultCount}`}</span>}
      <div className="navigation-component-separator" />
      <IconButton
        size={props.size}
        styleType="borderless"
        disabled={!isPrevEnabled}
        onClick={onPrevClick}
        title={props.localization.getLocalizedString("VersionCompare:searchBar.previous")}
      >
        <SvgChevronUp />
      </IconButton>
      <IconButton
        size={props.size}
        styleType="borderless"
        disabled={!isNextEnabled}
        onClick={onNextClick}
        title={props.localization.getLocalizedString("VersionCompare:searchBar.next")}
      >
        <SvgChevronDown />
      </IconButton>
    </div>
  );
}

interface FilterBarProps {
  localization: Localization;

  /** Modify size of the filter bar. */
  size?: "small" | "large";

  /** Text displayed in the filter bar. */
  text: string;

  /** On click handler when the text is clicked. */
  onTextClick?: () => void;

  /** On click handler when the clear button is clicked. */
  onCloseClick?: () => void;
}

function FilterBar(props: FilterBarProps): ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      className="search-bar-filter-bar"
      onClick={props.onTextClick}
      onKeyPress={props.onTextClick}
    >
      <span className={props.onTextClick && "selectable"}>{props.text}</span>
      <IconButton
        id="search-bar-filter-close"
        size={props.size}
        styleType="borderless"
        onClick={(event) => {
          event.stopPropagation();
          props.onCloseClick?.();
        }}
        title={props.localization.getLocalizedString("VersionCompare:searchBar.clear")}
      >
        <SvgClose />
      </IconButton>
    </div>
  );
}

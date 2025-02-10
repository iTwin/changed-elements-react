/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@itwin/core-frontend";
import { ContextMenu, ContextMenuDirection, ContextMenuItem } from "@itwin/core-react";
import { SvgBlank, SvgList, SvgSaveAs, SvgShare } from "@itwin/itwinui-icons-react";
import { IconButton, Input, Select, type SelectOption } from "@itwin/itwinui-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { FilterData, FilterOptions, SavedFiltersManager } from "../SavedFiltersManager.js";

import "./SavedFiltersSelector.scss";

export interface SavedFiltersSelectorProps {
  /** Cache for saved filters. */
  savedFilters: SavedFiltersManager;

  /** Callback to update the filter options. */
  onFilterSelected: (filterOptions: FilterOptions) => void;

  /** Callback to get current filter options. */
  getCurrentFilterOptions: () => FilterOptions;

  /** Callback when user clicks on edit filters. */
  onEditFilters: () => void;
}

/** Maintain last selected filter to let user edit. */
let cachedSelectedFilter: FilterData | undefined;

/** Selector component and buttons for storing saved filters and applying them. */
export function SavedFiltersSelector(props: SavedFiltersSelectorProps): ReactElement {
  const { savedFilters, onFilterSelected, getCurrentFilterOptions, onEditFilters } = props;
  const [filters, setFilters] = useState<FilterData[]>([]);
  const [filterName, setFilterName] = useState<string>("");
  const [selectedFilter, setSelectedFilter] = useState(cachedSelectedFilter);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [disable, setDisable] = useState(false);
  const iconRef = useRef<HTMLElement>(null);

  // Gets the filters from the cache and sets it in the component
  const getFilters = useCallback(
    async () => {
      const data = await savedFilters.getFilters();
      // Set filters sorted in alphabetical order
      setFilters(data.sort((a, b) => a.name.localeCompare(b.name)));
      // Clear up selected filter if updated data doesn't have the filter anymore
      if (selectedFilter !== undefined) {
        const found = data.find((sf) => sf.id === selectedFilter.id);
        if (found === undefined) {
          cachedSelectedFilter = undefined;
          setSelectedFilter(undefined);
        }
      }
    },
    [selectedFilter, savedFilters],
  );

  useEffect(
    () => {
      // Get filters in the background
      getFilters().catch(() => { });
    },
    [getFilters],
  );

  useEffect(
    () => {
      // Refresh filters when update event is sent
      savedFilters.onFiltersChanged.addListener(getFilters);
      // Clean-up listener
      return () => { savedFilters.onFiltersChanged.removeListener(getFilters); };
    },
    [selectedFilter, savedFilters, getFilters],
  );

  const onFilterChange = (filter: FilterData) => {
    // Apply filter and update parent components
    onFilterSelected(filter.filter);
    // Set the selected filter
    cachedSelectedFilter = filter;
    setSelectedFilter(filter);
  };

  const onSaveContextMenu = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    // Open context menu
    setShowSaveOptions((prev) => !prev);
    event.stopPropagation();
  };

  const onSaveOptionsOutsideClick = (event: MouseEvent) => {
    if (showSaveOptions && event.target !== iconRef.current) {
      setShowSaveOptions(false);
      event.stopPropagation();
    }
  };

  const isValid = () => {
    if (filterName.length === 0) {
      return false;
    }

    // Not valid if the filter name is already used
    return !filters.some((filter) => filter.name === filterName);
  };

  // Tries saving the filter and shows notification on success and failures
  const trySaveAsFilter = () => {
    if (isValid()) {
      // Disable UI until we finish saving filter
      setDisable(true);
      const filterOptions = getCurrentFilterOptions();
      savedFilters
        .saveFilter(filterName, false, filterOptions)
        .then(async (success) => {
          if (success) {
            // TODO: set selected filter as the one created
            IModelApp.notifications.outputMessage(
              new NotifyMessageDetails(
                OutputMessagePriority.Info,
                IModelApp.localization.getLocalizedString("VersionCompare:filters.saveAsSuccess"),
              ),
            );
            // Update currently selected filter
            const currentFilter = await savedFilters.getFilterByName(filterName);
            cachedSelectedFilter = currentFilter;
            setSelectedFilter(currentFilter);
          } else {
            IModelApp.notifications.outputMessage(
              new NotifyMessageDetails(
                OutputMessagePriority.Error,
                IModelApp.localization.getLocalizedString("VersionCompare:filters.saveAsError"),
              ),
            );
          }
          // Enable UI
          setDisable(false);
        })
        .catch(() => {
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(
              OutputMessagePriority.Error,
              IModelApp.localization.getLocalizedString("VersionCompare:filters.saveAsError"),
            ),
          );
          // Enable UI
          setDisable(false);
        });
    } else {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          IModelApp.localization.getLocalizedString("VersionCompare:filters.nameInvalid"),
        ),
      );
    }
  };

  // Tries updating the selected filter and shows notification on success or failures
  const tryUpdateFilter = () => {
    if (selectedFilter !== undefined) {
      // Disable UI while we are updating filter
      setDisable(true);
      // Update filter
      savedFilters
        .updateFilter(selectedFilter, selectedFilter.shared, getCurrentFilterOptions())
        .then(async (success) => {
          if (success) {
            IModelApp.notifications.outputMessage(
              new NotifyMessageDetails(
                OutputMessagePriority.Info,
                IModelApp.localization.getLocalizedString("VersionCompare:filters.saveSuccess"),
              ),
            );
            // Update currently selected filter
            const currentFilter = await savedFilters.getFilterByName(selectedFilter.name);
            cachedSelectedFilter = currentFilter;
            setSelectedFilter(currentFilter);
          } else {
            IModelApp.notifications.outputMessage(
              new NotifyMessageDetails(
                OutputMessagePriority.Error,
                IModelApp.localization.getLocalizedString("VersionCompare:filters.saveError"),
              ),
            );
          }
          // Enable UI again
          setDisable(false);
        })
        .catch(() => {
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(
              OutputMessagePriority.Error,
              IModelApp.localization.getLocalizedString("VersionCompare:filters.saveError"),
            ),
          );
          // Enable UI again
          setDisable(false);
        });
    }
  };

  const onUpdateAppliedClick = () => {
    setShowSaveOptions(false);
    tryUpdateFilter();
  };

  const onNameInputChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilterName(event.target.value ?? "");
  };

  const onNameInputBlur = () => {
    trySaveAsFilter();
    setIsCreatingNew(false);
  };

  const onNameInputKeyPressed = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      trySaveAsFilter();
      setIsCreatingNew(false);
    }
  };

  // Create a new filter
  const onCreateNewClick = () => {
    setIsCreatingNew(true);
    setShowSaveOptions(false);
  };

  // Open the edit dialog
  const onListIconClick = () => {
    onEditFilters();
    setShowSaveOptions(false);
  };

  const disableSaving = selectedFilter === undefined || !selectedFilter.editable;
  let saveTooltip = IModelApp.localization.getLocalizedString(
    disableSaving
      ? "VersionCompare:filters.saveTooltipInvalidUser"
      : "VersionCompare:filters.saveTooltip",
  );
  if (selectedFilter === undefined) {
    saveTooltip = IModelApp.localization.getLocalizedString("VersionCompare:filters.saveTooltipInvalidFilter");
  }

  const filterToOption = (data: FilterData): SelectOption<FilterData> => {
    return {
      value: data,
      label: data.name,
      icon: data.shared ? <SvgShare /> : <SvgBlank />,
    };
  };

  return (
    <div className="vc-saved-filters-selector">
      <div className="vc-saved-filters-input-container">
        {
          isCreatingNew &&
          <Input
            className="filter-name-input"
            type="string"
            value={filterName}
            onChange={onNameInputChanged}
            onBlur={onNameInputBlur}
            onKeyPress={onNameInputKeyPressed}
            disabled={disable}
          />
        }
        {
          !isCreatingNew &&
          // TODO: ThemedSelect does not set the placeholder when going from OptionType to undefined value
          <Select<FilterData>
            className="vc-saved-filters-themed-select"
            options={filters.map(filterToOption)}
            disabled={disable}
            onChange={onFilterChange}
            value={selectedFilter}
            placeholder={IModelApp.localization.getLocalizedString("VersionCompare:filters.savedFilters")}
          />
        }
      </div>
      <div className="save-icon-container">
        <IconButton
          disabled={disable}
          onClick={!disable ? onSaveContextMenu : undefined}
          className={showSaveOptions ? "dropdown" : ""}
          styleType="borderless"
        >
          <SvgSaveAs />
        </IconButton>
        <ContextMenu
          className="vc-save-filters-context-menu"
          opened={showSaveOptions}
          onOutsideClick={onSaveOptionsOutsideClick}
          direction={ContextMenuDirection.BottomLeft}
        >
          <ContextMenuItem
            key={0}
            onClick={onUpdateAppliedClick}
            disabled={disableSaving}
            title={saveTooltip}
          >
            {IModelApp.localization.getLocalizedString("VersionCompare:filters.save")}
          </ContextMenuItem>
          <ContextMenuItem
            key={1}
            onClick={onCreateNewClick}
            title={IModelApp.localization.getLocalizedString("VersionCompare:filters.saveAsTooltip")}
          >
            {IModelApp.localization.getLocalizedString("VersionCompare:filters.saveAs")}
          </ContextMenuItem>
        </ContextMenu>
      </div>
      <div className="save-icon-container">
        <IconButton
          disabled={disable}
          onClick={!disable ? onListIconClick : undefined}
          title={IModelApp.localization.getLocalizedString("VersionCompare:filters.edit")}
          styleType="borderless"
        >
          <SvgList />
        </IconButton>
      </div>
    </div>
  );
}

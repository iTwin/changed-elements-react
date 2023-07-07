/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { Id64String } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { ImageCheckBox, SearchBox } from "@itwin/core-react";
import { SvgProgressBackwardCircular } from "@itwin/itwinui-icons-react";
import { Checkbox, IconButton, Text } from "@itwin/itwinui-react";
import {
  useCallback, useEffect, useMemo, useState, type ChangeEventHandler, type ReactElement, type SetStateAction
} from "react";
import type { CellProps, Row } from "react-table";

import { FilterOptions, SavedFiltersManager } from "../SavedFiltersManager.js";
import { useVersionCompare } from "../VersionCompareContext.js";
import { SavedFiltersTable } from "./SavedFiltersDialog.js";
import { SavedFiltersSelector } from "./SavedFiltersSelector.js";
import { Table } from "./Table.js";

import "./AdvancedFiltersDialog.scss";

// Represents a single row in the Table.
export interface PropertyFilter {
  name: string;
  classId: Id64String;
  ids: string[];
  label?: string;
  value?: string;
  visible?: boolean;
}

interface PropertyLabelProps {
  cellProps: CellProps<PropertyFilter>;
}

/** Basic Property Label that takes the label from the cell props (doesn't load). */
function PropertyLabel(props: PropertyLabelProps): ReactElement {
  const { cellProps } = props;
  return <>{cellProps.row.original.label}</>;
}

interface CheckboxHeaderProps {
  cellProps: CellProps<PropertyFilter>;
  updateData?: ((cellProps: CellProps<PropertyFilter>, visible: boolean) => void) | undefined;
}

/** Custom checkbox column header. */
function CheckboxHeader(props: CheckboxHeaderProps): ReactElement {
  const { cellProps, updateData } = props;

  // We need to keep and update the state of the cell normally
  const [value, setValue] = useState(cellProps.value);
  const [indeterminate, setIndeterminate] = useState(cellProps.value);

  // If the initialValue is changed external, sync it up with our state
  useEffect(() => { setValue(cellProps.value); }, [cellProps.value]);

  const onChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    event.stopPropagation();
    const newValue = event.target.checked;
    setValue(newValue);
    updateData?.(cellProps, newValue);
  };

  useEffect(
    () => {
      const selectedCount = cellProps.rows.filter((row) => row.original.visible).length;
      const allSelected = selectedCount === cellProps.rows.length;
      const isIndeterminate = !allSelected && selectedCount > 0;
      setIndeterminate(isIndeterminate);
      if (isIndeterminate || selectedCount === 0) {
        setValue(false);
      } else if (allSelected) {
        setValue(true);
      }
    },
    [cellProps.rows, cellProps.data],
  );

  return <Checkbox checked={value} indeterminate={indeterminate} onChange={onChange} />;
}

export interface AdvancedFilterDialogProps {
  data: PropertyFilter[];
  setData: (arg: SetStateAction<PropertyFilter[]>) => void;
  showValues?: boolean;
  getCurrentFilterOptions: () => FilterOptions;
  onFilterSelected?: (filterOptions: FilterOptions) => void;
}

export function AdvancedFilterDialog(props: AdvancedFilterDialogProps): ReactElement {
  const { data, setData, showValues, onFilterSelected, getCurrentFilterOptions } = props;

  // Current searchbox text filter
  const [filter, setFilter] = useState("");
  // true if no results found
  const [noResults, setNoResults] = useState(false);
  // true if we are editing the saved filters
  const [showEditTable, setShowEditTable] = useState(false);

  // Called when the rows have changed in the Table
  const onRowsChanged = useCallback((rows: Row<PropertyFilter>[]) => { setNoResults(rows.length === 0); }, []);

  // Columns in the table
  const columns = useMemo(
    () => {
      // Update all rows with the visible boolean after edit
      const updateAllData = (cellProps: CellProps<PropertyFilter>, visibility: boolean) => {
        const updatedData = cellProps.data.slice();
        cellProps.rows.forEach((row) => (updatedData[row.index].visible = visibility));
        setData(updatedData);
      };

      // Update single row with the visible boolean after edit
      const onVisibilityClick = (cellProps: CellProps<PropertyFilter>, visibility: boolean) => {
        setData(
          (old) => old.map((row, index) => index === cellProps.row.index ? { ...row, visible: visibility } : row),
        );
      };

      return [
        {
          Header: "Name",
          columns: [
            {
              accessor: "visible",
              id: "visibility",
              align: "center",
              width: 15,
              disableSortBy: true,
              Header: (propsH: CellProps<PropertyFilter>) => {
                return <CheckboxHeader cellProps={propsH} updateData={updateAllData} />;
              },
              Cell: (props: CellProps<PropertyFilter>) => {
                const value = props.cell.value;
                return (
                  <ImageCheckBox
                    imageOn="icon-visibility"
                    imageOff="icon-visibility-hide-2"
                    checked={value}
                    onClick={(checked) => onVisibilityClick(props, checked)}
                  />
                );
              },
            },
            {
              Header: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.property"),
              accessor: "label",
              id: "label",
              filter: "includes",
              Cell: (props: CellProps<PropertyFilter>) => <PropertyLabel cellProps={props} />,
            },
            {
              Header: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.numberOfElements"),
              accessor: "ids.length",
              id: "elements",
              width: 50,
            },
            {
              Header: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.values"),
              accessor: "value",
              id: "value",
              width: 80,
              hidden: !showValues,
              canFilter: false,
              disableFilters: true,
              Cell: (props: CellProps<PropertyFilter>) => {
                const value = props.cell.value;
                return value === "**Varies**"
                  ? <Text className="filter-dialog-value-varies" isMuted>{value}</Text>
                  : <span>{value}</span>;
              },
            },
          ],
        },
      ];
    },
    [setData, showValues],
  );

  // Called from the filter selector. Update current filter options with the properties updated in the this dialog
  const getCurrentFilterOptionsWithProperties = () => {
    const currentOptions = { ...getCurrentFilterOptions() };
    currentOptions.wantedProperties.clear();
    for (const propData of data) {
      currentOptions.wantedProperties.set(propData.name, propData.visible ?? false);
    }

    return currentOptions;
  };

  // Called from the filter selector. Update visible properties and send to parent
  const onFilterSelectedWithProperties = (options: FilterOptions) => {
    if (onFilterSelected) {
      // Update the filters visibility
      setData((prev) => {
        return prev.map((currentFilter) => ({
          ...currentFilter,
          visible: options.wantedProperties.get(currentFilter.name) ?? false,
        }));
      });
      // Send to parent
      onFilterSelected(options);
    }
  };

  const onEditFilters = () => {
    setShowEditTable(true);
  };

  const { savedFilters } = useVersionCompare();

  const renderMainDialog = () => (
    <div className="filter-dialog-container">
      {
        savedFilters &&
        <div className="filter-dialog-apply-saved-filter-label">
          {IModelApp.localization.getLocalizedString("VersionCompare:filters.applySavedFilter")}
        </div>
      }
      <div className="filter-dialog-header">
        {
          savedFilters && onFilterSelected &&
          <SavedFiltersSelector
            savedFilters={savedFilters}
            onFilterSelected={onFilterSelectedWithProperties}
            getCurrentFilterOptions={getCurrentFilterOptionsWithProperties}
            onEditFilters={onEditFilters}
          />
        }
        <div className="filter-dialog-empty-header-space"></div>
        <SearchBox className="filter-dialog-search" onValueChanged={setFilter} />
      </div>
      <div className="filter-dialog-content">
        <Table<PropertyFilter>
          columns={columns}
          data={data}
          columnSortBy={[{ id: "name", desc: false }]}
          searchText={filter}
          onRowsChanged={onRowsChanged}
        />
        {
          noResults &&
          <div className="filter-dialog-no-results">
            <span className="icon icon-compare" />
            <Text isMuted>
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noResults")}
            </Text>
          </div>
        }
      </div>
    </div>
  );

  const onBack = () => {
    setShowEditTable(false);
  };

  const renderEditSavedFilters = (savedFilters: SavedFiltersManager) => {
    return (
      <div className="filter-dialog-container">
        <div className="filter-dialog-edit-table-header">
          <IconButton
            className="filter-dialog-container-back-button"
            onClick={onBack}
            styleType="borderless"
          ><SvgProgressBackwardCircular />
          </IconButton>
          <div className="filter-dialog-edit-table-header-label">
            {IModelApp.localization.getLocalizedString("VersionCompare:filters.edit")}
          </div>
        </div>
        <SavedFiltersTable savedFilters={savedFilters} />
      </div>
    );
  };

  if (showEditTable && savedFilters) {
    return renderEditSavedFilters(savedFilters);
  }

  return renderMainDialog();
}

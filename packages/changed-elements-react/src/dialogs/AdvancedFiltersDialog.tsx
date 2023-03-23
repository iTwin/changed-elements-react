/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ModalDialogManager } from "@itwin/appui-react";
import type { Id64String } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Dialog, DialogButtonStyle, DialogButtonType, ImageCheckBox, SearchBox } from "@itwin/core-react";
import { Checkbox } from "@itwin/itwinui-react";
import { ChangeEventHandler, ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import type { CellProps, Row } from "react-table";

import type { FilterOptions } from "../widgets/EnhancedElementsInspector.js";
import "./AdvancedFiltersDialog.scss";
import { Table } from "./Table.js";

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
  showValues?: boolean;
  onSave?: (filterSettings: PropertyFilter[]) => void;
  iModelConnection: IModelConnection;
  getCurrentFilterOptions: () => FilterOptions;
  onFilterSelected?: (filterOptions: FilterOptions) => void;
}

export function AdvancedFilterDialog({ data, showValues, onSave }: AdvancedFilterDialogProps): ReactElement {
  // Current searchbox text filter
  const [filter, setFilter] = useState("");
  // List of all data (modifed)
  const [modifiedData, setModifiedData] = useState<PropertyFilter[]>([]);
  // true if no results found
  const [noResults, setNoResults] = useState(false);

  // Called when the save button on the dialog is clicked
  const onSaveClick = useCallback(
    () => {
      ModalDialogManager.closeDialog();
      onSave?.(modifiedData);
    },
    [modifiedData],
  );

  // Called when the cancel button on the dialog is clicked
  const onCancel = useCallback(() => { ModalDialogManager.closeDialog(); }, []);

  // Called when the rows have changed in the Table
  const onRowsChanged = useCallback((rows: Row<PropertyFilter>[]) => { setNoResults(rows.length === 0); }, []);

  // Initialize the modified data with the data passed in
  useEffect(
    () => {
      // Clone the array since we're modal
      const newData = data.map((a) => ({ ...a }));
      setModifiedData(newData);
    },
    [data],
  );

  // Update all rows with the visible boolean after edit
  const updateAllData = (cellProps: CellProps<PropertyFilter>, visibility: boolean) => {
    const updatedData = cellProps.data.slice();
    cellProps.rows.forEach((row) => (updatedData[row.index].visible = visibility));
    setModifiedData(updatedData);
  };

  // Update single row with the visible boolean after edit
  const onVisibilityClick = (cellProps: CellProps<PropertyFilter>, visibility: boolean) => {
    setModifiedData(
      (old) => old.map((row, index) => index === cellProps.row.index ? { ...row, visible: visibility } : row),
    );
  };

  // Columns in the table
  const columns = useMemo(
    () => [
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
              const isVaries = value === "**Varies**";
              const className = isVaries ? "filter-dialog-value-varies" : "";
              return <span className={className}>{value}</span>;
            },
          },
        ],
      },
    ],
    [],
  );

  const renderMainDialog = () => (
    <div className="filter-dialog-container">
      <div className="filter-dialog-header">
        <div className="filter-dialog-empty-header-space"></div>
        <SearchBox className="filter-dialog-search" onValueChanged={setFilter} />
      </div>
      <div className="filter-dialog-content">
        <Table<PropertyFilter>
          columns={columns}
          data={modifiedData}
          columnSortBy={[{ id: "name", desc: false }]}
          searchText={filter}
          onRowsChanged={onRowsChanged}
        />
        {
          noResults &&
          <div className="filter-dialog-no-results">
            <span className="icon icon-compare" />
            <span>{IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noResults")}</span>
          </div>
        }
      </div>
    </div>
  );

  return (
    <Dialog
      title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.settingsTitle")}
      opened={true}
      resizable={false}
      movable={true}
      modal={true}
      width="40%"
      minWidth={500}
      minHeight={400}
      onClose={onCancel}
      buttonCluster={[
        {
          type: DialogButtonType.OK,
          buttonStyle: DialogButtonStyle.Blue,
          onClick: onSaveClick,
          label: IModelApp.localization.getLocalizedString("VersionCompare:filters.apply"),
        },
        {
          type: DialogButtonType.Cancel,
          onClick: onCancel,
        },
      ]}
    >
      {renderMainDialog()}
    </Dialog>
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  PropertyRecord, PropertyValueFormat, type ArrayValue, type PrimitiveValue, type PropertyDescription,
  type PropertyValue, type StructValue
} from "@itwin/appui-abstract";
import { ConfigurableCreateInfo, ContentControl, FrontstageManager } from "@itwin/appui-react";
import {
  SelectionMode, Table, TableDataChangeEvent, TableSelectionTarget, type ColumnDescription, type PropertyCategory,
  type PropertyData, type RowItem, type TableDataProvider
} from "@itwin/components-react";
import { Logger } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { LoadingSpinner } from "@itwin/core-react";
import { Slider, ToggleSwitch } from "@itwin/itwinui-react";
import { KeySet } from "@itwin/presentation-common";
import { PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { Presentation, type SelectionChangeEventArgs } from "@itwin/presentation-frontend";
import { Component, ReactElement } from "react";
import { connect } from "react-redux";

import type { ChangedElementEntry } from "../api/ChangedElementEntryCache";
import { getTypeOfChangeTooltip } from "../api/ChangesTooltipProvider";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages";
import { VersionCompare } from "../api/VersionCompare";
import { VersionCompareManager } from "../api/VersionCompareManager";
import { updateVersionComparisonTransparencies } from "../api/VersionCompareTiles";
import { PropertyComparisonFrontstage } from "../frontstages/PropertyComparisonFrontstage";
import { VersionCompareState } from "../store/VersionCompareStore";
import "./PropertyComparisonTable.scss";

const LOGGER_CATEGORY = "VersionCompare:PropertyComparisonTable";

export interface PropertyComparisonTableControlOptions {
  manager?: VersionCompareManager | undefined;
}

export class PropertyComparisonTableControl extends ContentControl {
  constructor(info: ConfigurableCreateInfo, options: PropertyComparisonTableControlOptions) {
    super(info, options);

    if (options.manager === undefined) {
      Logger.logError(
        VersionCompare.logCategory,
        "Programmer Error: Property Comparison Table Control should be passed a VersionCompareManager object as application Data (applicationData.manager)",
      );
      throw new Error(
        "Programmer Error: Property Comparison Table Control should be passed a VersionCompareManager object as application Data (applicationData.manager)",
      );
    }

    this.reactNode = (
      <ConnectedPropertyComparisonTable manager={options.manager} />
    );
  }
}

export interface OverviewOpacitySliderProps {
  manager: VersionCompareManager;
}

/** Slider for changing opacity of each iModel. */
export class OverviewOpacitySlider extends Component<OverviewOpacitySliderProps> {
  /** Handle opacity changes */
  private _onOpacitySliderChange = (values: readonly number[]) => {
    const vp = IModelApp.viewManager.getFirstOpenView();
    if (vp !== undefined) {
      const current = values[0] / 100.0;
      const target = 1.0 - current;
      updateVersionComparisonTransparencies(vp, current, target);
    }
  };

  public override render() {
    return (
      <Slider
        min={0}
        max={100}
        values={[50]}
        onUpdate={this._onOpacitySliderChange}
        minLabel={this.props.manager.currentVersion?.displayName}
        maxLabel={this.props.manager.targetVersion?.displayName}
        tooltipProps={() => ({ visible: false })}
      />
    );
  }
}

export interface ComparisonDataRow {
  category: string;
  propertyName: string;
  current: string;
  target: string;
}

export interface SingleComparisonData {
  category: string;
  propertyName: string;
  value: string;
}

/**
 * Property Comparison Table data provider. Consists of two data providers that connect to the current IModelConnection
 * and the target IModelConnection to obtain properties for an element from two different backends with different
 * versions of the iModel. It also provides flattening out those properties to easily render them in a table and it
 * merges the results into a single structure.
 */
export class PropertyComparisonTableDataProvider implements TableDataProvider {
  constructor(
    private _onPropertyLoading: () => void,
    private _onPropertyLoaded: () => void,
    private _showChangedOnly: boolean,
  ) { }

  private _manager: VersionCompareManager | undefined;

  private _primaryVersionDataProvider: PresentationPropertyDataProvider | undefined;
  private _secondaryVersionDataProvider: PresentationPropertyDataProvider | undefined;

  private _primaryData: PropertyData | undefined;
  private _secondaryData: PropertyData | undefined;

  /** Uses a string that combines category and flattened property name like so: "[categoryName].[propertyName]". */
  private _comparisonData: Map<string, ComparisonDataRow> = new Map<string, ComparisonDataRow>();
  private _filteredData: Map<string, ComparisonDataRow> | undefined;

  /** Cached array generated from the comparison data */
  private _rows: ComparisonDataRow[] = [];
  private _rowsDirty = true;

  /** Controls the selected index */
  private _selectedIndex = -1;
  private _selectedRow: RowItem | undefined;

  public onColumnsChanged: TableDataChangeEvent = new TableDataChangeEvent();
  public onRowsChanged: TableDataChangeEvent = new TableDataChangeEvent();

  private _columns: ColumnDescription[] | undefined;

  private _handlePrimitiveRecord = (
    rows: SingleComparisonData[],
    currentCategory: string,
    record: PropertyRecord,
    propertyPrefix?: string,
  ): void => {
    rows.push({
      category: currentCategory,
      propertyName: (propertyPrefix ? propertyPrefix + " - " : "") + record.property.displayLabel,
      value: (record.value as PrimitiveValue).displayValue ?? "",
    });
  };

  private _handleArrayRecord = (
    rows: SingleComparisonData[],
    currentCategory: string,
    record: PropertyRecord,
    propertyPrefix?: string,
  ): void => {
    const arrayValue: ArrayValue = record.value as ArrayValue;
    arrayValue.items.forEach((valueRecord: PropertyRecord) => {
      this._processPropertyRecord(
        rows,
        currentCategory,
        valueRecord,
        (propertyPrefix ? propertyPrefix + " - " : "") + record.property.displayLabel,
      );
    });
  };

  private _handleStructRecord = (
    rows: SingleComparisonData[],
    currentCategory: string,
    record: PropertyRecord,
    propertyPrefix?: string,
  ): void => {
    const structValue: StructValue = record.value as StructValue;
    for (const name in structValue.members) {
      this._processPropertyRecord(
        rows,
        currentCategory,
        structValue.members[name],
        (propertyPrefix ? propertyPrefix + " - " : "") + record.property.displayLabel,
      );
    }
  };

  private _processPropertyRecord = (
    rows: SingleComparisonData[],
    currentCategory: string,
    record: PropertyRecord,
    propertyPrefix?: string,
  ): void => {
    switch (record.value.valueFormat) {
      case PropertyValueFormat.Primitive:
        this._handlePrimitiveRecord(rows, currentCategory, record, propertyPrefix);
        break;
      case PropertyValueFormat.Array:
        this._handleArrayRecord(rows, currentCategory, record, propertyPrefix);
        break;
      case PropertyValueFormat.Struct:
        this._handleStructRecord(rows, currentCategory, record, propertyPrefix);
        break;
    }
  };

  /**
   * Flattens the property data into an array and prefixes property names so that user is aware of where they come from.
   * @param data PropertyData to flatten.
   */
  private _getFlattenedProperties(data: PropertyData): SingleComparisonData[] {
    const rows: SingleComparisonData[] = [];

    const processCategory = ({ name, label, childCategories }: PropertyCategory) => {
      if (data.records[name]) {
        data.records[name].forEach((value) => this._processPropertyRecord(rows, label, value));
      } else {
        Logger.logWarning(LOGGER_CATEGORY, `No records found with category name: ${name}`);
      }

      if (childCategories) {
        for (const childCategory of childCategories) {
          processCategory(childCategory);
        }
      }
    };

    data.categories.forEach((category) => {
      if (category.name !== "Favorite") {
        processCategory(category);
      }
    });

    return rows;
  }

  /**
   * Manufacture a key for the row map.
   * @param value Comparison data to use to manufacture key.
   */
  private _manufactureKey(value: SingleComparisonData): string {
    return value.category + "." + value.propertyName;
  }

  /** Inserts data into the row map. */
  private _primaryDataChangedHandler = async (): Promise<void> => {
    if (!this._primaryVersionDataProvider) {
      return;
    }

    try {
      this._primaryData = await this._primaryVersionDataProvider.getData();
    } catch (e) {
      this._primaryData = undefined;
    }

    const rows: SingleComparisonData[] = this._primaryData ? this._getFlattenedProperties(this._primaryData) : [];
    if (this._comparisonData) {
      // Insert entries
      for (const value of rows) {
        const key = this._manufactureKey(value);
        if (this._comparisonData.has(key)) {
          // Add the current value
          const entry: ComparisonDataRow | undefined = this._comparisonData.get(key);
          if (entry) {
            entry.current = value.value;
          }
        } else {
          // Create a new row
          const entry: ComparisonDataRow = {
            category: value.category,
            propertyName: value.propertyName,
            current: value.value,
            target: "",
          };
          this._comparisonData.set(key, entry);
        }
      }
    }
  };

  /** Inserts data into the row map */
  private _secondaryDataChangedHandler = async (): Promise<void> => {
    if (!this._secondaryVersionDataProvider) {
      return;
    }

    try {
      this._secondaryData = await this._secondaryVersionDataProvider.getData();
    } catch (e) {
      this._secondaryData = undefined;
    }

    const rows: SingleComparisonData[] = this._secondaryData ? this._getFlattenedProperties(this._secondaryData) : [];
    if (this._comparisonData !== undefined) {
      // Insert entries
      for (const value of rows) {
        const key = this._manufactureKey(value);
        if (this._comparisonData.has(key)) {
          // Add the current value
          const entry: ComparisonDataRow | undefined = this._comparisonData.get(key);
          if (entry) {
            entry.target = value.value;
          }
        } else {
          // Create a new row
          const entry: ComparisonDataRow = {
            category: value.category,
            propertyName: value.propertyName,
            target: value.value,
            current: "",
          };
          this._comparisonData.set(key, entry);
        }
      }
    }
  };

  /** Generates the filtered changed-only list of rows */
  private _updateChangedOnly(): void {
    this._filteredData = new Map<string, ComparisonDataRow>();
    if (this._comparisonData !== undefined) {
      this._comparisonData.forEach((value, key) => {
        if (value.current !== value.target) {
          this._filteredData?.set(key, value);
        }
      });
    }
  }

  /** Returns True if the data provider is showing 'changed properties' and there are none to show. */
  public isShowingAnyData = (): boolean => {
    return !this._showChangedOnly || this._filteredData?.size !== 0;
  };

  /** Toggle to only show changed properties. */
  public setShowChanged(value: boolean): void {
    this._showChangedOnly = value;
    this._rowsDirty = true;

    this.onRowsChanged.raiseEvent();
  }

  /**
   * Update selection for displaying properties.
   * @param selection
   */
  public async updateSelection(selection: KeySet): Promise<void> {
    if (this._primaryVersionDataProvider && this._secondaryVersionDataProvider) {
      // Message we are currently loading properties
      this._onPropertyLoading();
      // Set data provider keys to obtain data
      this._primaryVersionDataProvider.keys = selection;
      this._secondaryVersionDataProvider.keys = selection;
      // Handle the property data
      await this._primaryDataChangedHandler();
      await this._secondaryDataChangedHandler();
      // Update filtered by changed only array
      this._updateChangedOnly();
      // Trigger property loaded event
      this._onPropertyLoaded();
      // E2E test verbose message
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.propertyComparisonTableLoadedProperties);
    }
  }

  /**
   * Sets up the two data providers that communicate with both IModelConnection objects to obtain properties in each of
   * the versions being inspected.
   * @param manager Version Compare Manager object.
   * @param mainConnection Current IModelConnection.
   * @param secondaryConnection Target IModelConnection being compared against.
   */
  public async setupProviders(
    manager: VersionCompareManager,
    mainConnection: IModelConnection,
    secondaryConnection: IModelConnection,
    selection?: KeySet,
  ): Promise<void> {
    // Reference to the manager object
    this._manager = manager;
    // Create providers for property data
    this._primaryVersionDataProvider = new PresentationPropertyDataProvider({ imodel: mainConnection });
    this._secondaryVersionDataProvider = new PresentationPropertyDataProvider({ imodel: secondaryConnection });
    this._primaryVersionDataProvider.onDataChanged.addListener(this._primaryDataChangedHandler);
    this._secondaryVersionDataProvider.onDataChanged.addListener(this._secondaryDataChangedHandler);

    // Update selection for data providers
    if (selection !== undefined) {
      await this.updateSelection(selection);
    }
  }

  /** Clean up listeners */
  public cleanUp() {
    if (this._primaryDataChangedHandler && this._primaryVersionDataProvider) {
      this._primaryVersionDataProvider.onDataChanged.removeListener(this._primaryDataChangedHandler);
    }
    if (this._secondaryDataChangedHandler && this._secondaryVersionDataProvider) {
      this._secondaryVersionDataProvider.onDataChanged.removeListener(this._secondaryDataChangedHandler);
    }

    this._primaryVersionDataProvider = undefined;
    this._secondaryVersionDataProvider = undefined;
  }

  /** Get the columns of the property comparison table */
  public async getColumns(): Promise<ColumnDescription[]> {
    if (!this._manager) {
      Logger.logError(VersionCompare.logCategory, "VersionCompareManager not defined in PropertyComparisonTable");
      throw new Error("VersionCompareManager not defined in PropertyComparisonTable");
    }

    const defaultLabel = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.version");
    let currentLabel = this._manager.currentVersion && this._manager.currentVersion.displayName
      ? this._manager.currentVersion.displayName
      : defaultLabel;
    currentLabel += " "
      + IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.currentVersionSuffix");
    const targetLabel = this._manager.targetVersion && this._manager.targetVersion.displayName
      ? this._manager.targetVersion.displayName
      : defaultLabel;

    return [
      {
        key: "category",
        label: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.category"),
        resizable: true,
        sortable: true,
      },
      {
        key: "propertyName",
        label: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.property"),
        resizable: true,
        sortable: true,
      },
      {
        key: "current",
        label: currentLabel,
        resizable: true,
        sortable: true,
      },
      {
        key: "target",
        label: targetLabel,
        resizable: true,
        sortable: true,
      },
    ];
  }

  /** Count of rows based on the properties found. */
  public async getRowsCount(): Promise<number> {
    if (!this._comparisonData) {
      return 0;
    }

    if (!this._showChangedOnly) {
      return this._comparisonData.size;
    }

    if (this._filteredData) {
      return this._filteredData.size;
    }

    return 0;
  }

  /** Get the rows for the table. */
  private _getRows(): ComparisonDataRow[] {
    if (this._rowsDirty) {
      this._rows = this._generateRowArray();
      this._rowsDirty = false;
    }

    return this._rows;
  }

  /** Generation of the row array used in generating table data */
  private _generateRowArray(): ComparisonDataRow[] {
    if (!this._showChangedOnly && this._comparisonData) {
      const array: ComparisonDataRow[] = [];
      this._comparisonData.forEach((value) => array.push(value));

      return array;
    }

    if (this._showChangedOnly && this._filteredData) {
      const array: ComparisonDataRow[] = [];
      this._filteredData.forEach((value) => array.push(value));

      return array;
    }

    return [];
  }

  /** Create a record out of a string. */
  private _createPropertyRecord(value: string, column: ColumnDescription): PropertyRecord {
    const v: PropertyValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value,
      displayValue: value,
    };
    const pd: PropertyDescription = {
      typename: column.icon ? "icon" : "text",
      name: column.key,
      displayLabel: column.label,
    };
    return new PropertyRecord(v, pd);
  }

  /** Get row color overrides depending on change. */
  private getColorOverrides(row: ComparisonDataRow) {
    if (row.current === "" && row.target !== "") {
      return { backgroundColor: 0xcc0000, backgroundColorSelected: 0xffb3b3 };
    } else if (row.current !== "" && row.target === "") {
      return { backgroundColor: 0x56aa1c, backgroundColorSelected: 0xd4f4bd };
    } else if (this.isChangedRow(row)) {
      return { backgroundColor: 0x008be1, backgroundColorSelected: 0xb3e2ff };
    } else {
      return undefined;
    }
  }

  /** Get the row in the array. */
  public async getRow(_rowIndex: number): Promise<RowItem> {
    const rows = this._getRows();
    const row = rows[_rowIndex];
    if (!row) {
      return { key: "", cells: [] };
    }

    if (!this._columns) {
      this._columns = await this.getColumns();
    }

    const overrides = this.getColorOverrides(row);
    return {
      key: row.category + "." + row.propertyName,
      colorOverrides: overrides,
      cells: [
        {
          key: "category",
          record: this._createPropertyRecord(row.category, this._columns[0]),
        },
        {
          key: "propertyName",
          record: this._createPropertyRecord(row.propertyName, this._columns[1]),
        },
        {
          key: "current",
          record: this._createPropertyRecord(row.current, this._columns[2]),
        },
        {
          key: "target",
          record: this._createPropertyRecord(row.target, this._columns[3]),
        },
      ],
    };
  }

  /**
   * Custom logic for selecting rows.
   * @param rowItem Row Item to check for.
   */
  public isRowSelected(rowItem: RowItem): boolean {
    return !!this._selectedRow && rowItem.key === this._selectedRow.key;
  }

  /**
   * Checks if a row is changed based on the property values found in both IModelConnections.
   * @param value Row data with the property values.
   */
  public isChangedRow(value: ComparisonDataRow): boolean {
    return value.current !== value.target;
  }

  /** Resets and cleans the filtered items. */
  public reset(): void {
    // Cleanup map so that when providers have data it is populated anew
    this._comparisonData = new Map<string, ComparisonDataRow>();
    if (this._filteredData) {
      this._filteredData.clear();
    }
  }

  /**
   * Cycle through the changed rows and select them. Returns index of selected row
   * @param up Whether to go up or down in the table
   */
  public async cycleNextChanged(up: boolean): Promise<number> {
    const rows = this._getRows();
    const changedIndices: number[] = [];
    rows.forEach((value: ComparisonDataRow, index: number) => {
      if (this.isChangedRow(value)) {
        changedIndices.push(index);
      }
    });

    // Cycle through the indices
    if (this._selectedIndex === -1) {
      this._selectedIndex = up ? changedIndices.length : 0;
    } else {
      this._selectedIndex = up ? this._selectedIndex - 1 : this._selectedIndex + 1;
    }

    // Warp value
    if (this._selectedIndex > changedIndices.length - 1) {
      this._selectedIndex = 0;
    } else if (this._selectedIndex < 0) {
      this._selectedIndex = changedIndices.length - 1;
    }

    this._selectedRow = await this.getRow(changedIndices[this._selectedIndex]);
    this.onRowsChanged.raiseEvent();
    return changedIndices[this._selectedIndex];
  }

  /** Not Implemented: Sort by column and direction. */
  public async sort(): Promise<void> { }
}

// We need to pass a lambda that returns the connection so that each time we open the frontstage we get the right
// connections dynamically. The Control that gets the application data only gets created once, so I haven't found a better
// way to decouple this component from the App than passing in getter functions as props.
export interface PropertyComparisonProps {
  /** Optional manager to override using default. */
  manager?: VersionCompareManager;

  /** KeySet of the selection to display results for in the table. */
  selection?: KeySet;

  /** Default value of show changed only toggle. */
  showChangedOnly?: boolean;

  /** Callback function called on showChangedOnly change. */
  onShowChangedOnlyChange?: (value: boolean) => void;
}

interface PropertyComparisonTableState {
  loading: boolean;
  manager: VersionCompareManager;
  changedElement?: ChangedElementEntry;
  scrollRowIndex?: number;
  sideBySide: boolean;
  showEmptyChangedPropertyMessage?: boolean;
  showChangedOnly: boolean;
}

/** Table component to show a property comparison of an element between two iModelConnections. */
export class PropertyComparisonTable extends Component<PropertyComparisonProps, PropertyComparisonTableState> {
  private _unmounted = false;
  private _onPropertiesLoading = (): void => {
    this.safelySetState({ ...this.state, loading: true });
  };

  private _onPropertiesLoaded = (): void => {
    this.safelySetState({ ...this.state, loading: false });
  };

  private _table: Table | null = null;
  private _dataProvider: PropertyComparisonTableDataProvider;

  constructor(props: PropertyComparisonProps) {
    super(props);

    const manager = props.manager ?? VersionCompare.manager;
    if (manager === undefined) {
      Logger.logError(
        VersionCompare.logCategory,
        "Cannot initialize PropertyComparisonTable without a VersionCompareManager initialized or passed",
      );
      throw new Error(
        "Cannot initialize PropertyComparisonTable without a VersionCompareManager initialized or passed",
      );
    }

    const showChangedOnly = !!this.props.showChangedOnly;

    this.state = {
      manager,
      loading: true,
      sideBySide: manager.wantNinezone ? PropertyComparisonFrontstage.isSideBySide : false,
      showChangedOnly,
    };

    this._dataProvider = new PropertyComparisonTableDataProvider(
      this._onPropertiesLoading,
      this._onPropertiesLoaded,
      showChangedOnly,
    );
  }

  /** Load change type of element based on selection */
  private _updateElementInfo = async (currentSelection: KeySet): Promise<void> => {
    if (currentSelection.instanceKeysCount !== 1) {
      return;
    }

    // Retrieve selected instance Id
    let selectedId: string | undefined;
    currentSelection.instanceKeys.forEach((ids: Set<string>) => {
      if (ids.size === 1) {
        selectedId = [...ids][0];
      }
    });
    if (selectedId === undefined) {
      return;
    }

    // Obtain changed element entry for selected instance
    let entries = await this.state.manager.changedElementsManager.entryCache.get([selectedId]);
    if (entries.length !== 1) {
      return;
    }

    // Get label of entry
    if (this.state.manager.changedElementsManager.labels !== undefined) {
      entries = await this.state.manager.changedElementsManager.labels.populateEntries(entries);
    }

    const entry = entries[0];
    this.safelySetState({ changedElement: entry });
  };

  /**
   * Setup the data provider with new iModel connections for comparison.
   * @param currentIModel Current IModel for comparison.
   * @param targetIModel Target IModel for comparison.
   */
  private _setupDataProvider = async (
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
  ): Promise<void> => {
    this._dataProvider
      .setupProviders(
        this.state.manager,
        currentIModel,
        targetIModel,
        this.props.selection,
      )
      .catch(() => { }); // Just do in background

    if (this.props.selection) {
      await this._updateElementInfo(this.props.selection);
    }
  };

  /** Clean up the provider. */
  private _cleanUpDataProvider = (): void => {
    this._dataProvider.cleanUp();
  };

  /** Handle selection set when in non-ninezone mode. */
  private _selectionChangedHandler = async (args: SelectionChangeEventArgs): Promise<void> => {
    // Make non-readonly
    const keys = new KeySet(args.keys);
    // Update selection of data provider
    await this._dataProvider.updateSelection(keys);
    // Update element info like change type and label
    await this._updateElementInfo(keys);
  };

  /** Setup events and load change type of inspected element */
  public override async componentDidMount(): Promise<void> {
    // Handler for setting up the data providers when starting comparison
    this.state.manager.versionCompareStarted.addListener(this._setupDataProvider);
    // Handler for cleaning up data providers when stopping comparison
    this.state.manager.versionCompareStopped.addListener(this._cleanUpDataProvider);
    // Handler for selection change whenever we are not in ninezone mode
    if (!this.state.manager.wantNinezone) {
      Presentation.selection.selectionChange.addListener(this._selectionChangedHandler);
    }

    // If we are comparing already (e.g. ninezone mode goes into property comparison frontstage when already comparing),
    // setup data providers and load the change type of element
    if (this.state.manager.currentIModel && this.state.manager.targetIModel && this.state.manager.isComparing) {
      await this._setupDataProvider(this.state.manager.currentIModel, this.state.manager.targetIModel);
    }
  }

  public override componentWillUnmount(): void {
    this.state.manager.versionCompareStarted.removeListener(this._setupDataProvider);
    this.state.manager.versionCompareStopped.removeListener(this._cleanUpDataProvider);
    if (!this.state.manager.wantNinezone) {
      Presentation.selection.selectionChange.removeListener(this._selectionChangedHandler);
    }

    this._dataProvider.cleanUp();
    this._unmounted = true;
  }

  private safelySetState<K extends keyof PropertyComparisonTableState>(
    state: Pick<PropertyComparisonTableState, K>,
  ): void {
    if (!this._unmounted) {
      this.setState(state);
    }
  }

  public async handleCycle(up: boolean): Promise<void> {
    const index = await this._dataProvider.cycleNextChanged(up);
    if (this._table) {
      this._table.updateSelectedRows();
    }

    this.safelySetState({ scrollRowIndex: index });
  }

  /** Toggle between side-by-side and overview mode. */
  private _onToggleInspectMode = async (): Promise<void> => {
    // Toggle layout
    await PropertyComparisonFrontstage.toggleLayout();

    // enable visualization with modified elements from the other iModel
    const activeFrontstageDef = FrontstageManager.activeFrontstageDef;
    if (activeFrontstageDef !== undefined && activeFrontstageDef.id !== PropertyComparisonFrontstage.id) {
      return;
    }

    if (PropertyComparisonFrontstage.isOverview) {
      // Enable overview visualization that shows both modified elements in before and after state
      await this.state.manager.enableVisualization(true, this.props.selection);

      // Set transparency to center since slider starts in center
      const vp = IModelApp.viewManager.getFirstOpenView();
      if (vp) {
        updateVersionComparisonTransparencies(vp, 0.5, 0.5);
      }

      this.safelySetState({ sideBySide: false });
    } else if (PropertyComparisonFrontstage.isSideBySide) {
      // Enable side-by-side visualization with viewport syncing functionality
      await this.state.manager.enableSideBySideVisualization();
      this.safelySetState({ sideBySide: true });
    }
  };

  private getHeader(): ReactElement {
    const setShowChanged = () => {
      const showChangedOnly = !this.state.showChangedOnly;
      this._dataProvider.setShowChanged(showChangedOnly);
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.propertyComparisonTableToggleShowChangedProps);
      this.safelySetState({
        showEmptyChangedPropertyMessage: !this._dataProvider.isShowingAnyData(),
        showChangedOnly,
      });
      this.props.onShowChangedOnlyChange?.(showChangedOnly);
    };
    const changeTypeInfo = this.state.changedElement !== undefined
      ? getTypeOfChangeTooltip(this.state.changedElement)
      : undefined;
    return (
      <div className="header">
        <div className="header-element-label">
          <div className="header-element-label-text" title={this.state.changedElement?.label}>
            {this.state.changedElement?.label}
          </div>
          {
            this.state.manager.wantTypeOfChange && changeTypeInfo !== undefined &&
            <div className="header-change-type" title={changeTypeInfo}>
              {changeTypeInfo}
            </div>
          }
        </div>
        {
          this.state.manager.wantNinezone && !this.state.sideBySide &&
          <OverviewOpacitySlider manager={this.state.manager} />
        }
        <div className="settings">
          {
            this.state.manager.wantNinezone &&
            <ToggleSwitch
              checked={this.state.sideBySide}
              onChange={this._onToggleInspectMode}
              label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.sideBySide")}
            />
          }
          <ToggleSwitch
            checked={this.state.showChangedOnly}
            onChange={setShowChanged}
            label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.onlyChangedProps")}
          />
        </div>
        <div className="property-navigation">
          <div
            className="chevron-button icon icon-chevron-up"
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.scrollToChangedProperty")}
            onClick={() => this.handleCycle(true)}
            data-testid="pct-up-chevron"
          />
          <div
            className="chevron-button icon icon-chevron-down"
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.scrollToChangedProperty")}
            onClick={() => this.handleCycle(false)}
            data-testid="pct-down-chevron"
          />
        </div>
      </div>
    );
  }

  public override render(): ReactElement {
    return (
      <div className="property-comparison-container">
        <div className="property-comparison-table">{this.getHeader()}</div>
        {
          this.state.loading ? (
            <div className="pc-loading-spinner" data-testid="pct-loading-spinner">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="pc-table-container" data-testid="pct-loaded-content">
              {
                this.state.showEmptyChangedPropertyMessage ? (
                  <div className="pc-no-changed-properties">
                    <div className="pc-table-message">
                      {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noChangedProperties")}
                    </div>
                  </div>
                ) : (
                  <Table
                    ref={(table) => this._table = table}
                    selectionMode={SelectionMode.SingleAllowDeselect}
                    isRowSelected={this._dataProvider.isRowSelected.bind(this._dataProvider)}
                    dataProvider={this._dataProvider}
                    scrollToRow={this.state.scrollRowIndex}
                    tableSelectionTarget={TableSelectionTarget.Row}
                  />
                )
              }
            </div>
          )
        }
      </div>
    );
  }
}

const mapStateToProps = (
  state: { versionCompareState: VersionCompareState; },
  ownProps: PropertyComparisonProps,
): PropertyComparisonProps => {
  return {
    manager: ownProps.manager,
    showChangedOnly: ownProps.showChangedOnly,
    onShowChangedOnlyChange: ownProps.onShowChangedOnlyChange,
    selection: state.versionCompareState.selection,
  };
};

export const ConnectedPropertyComparisonTable = connect(mapStateToProps)(PropertyComparisonTable);

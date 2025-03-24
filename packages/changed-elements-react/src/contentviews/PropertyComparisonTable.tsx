/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { Logger } from "@itwin/core-bentley";
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { IconButton, Slider, Table, Text, ToggleSwitch } from "@itwin/itwinui-react";
import type { KeySet } from "@itwin/presentation-common";
import { PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import type { PropertyCategory, PropertyData } from "@itwin/components-react";
import { SvgChevronDown, SvgChevronUp } from "@itwin/itwinui-icons-react";
import { useVersionCompare } from "../VersionCompareContext.js";
import type { ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import type { ChangedElementsManager } from "../api/ChangedElementsManager.js";
import { getTypeOfChangeTooltip } from "../api/ChangesTooltipProvider.js";
import type { VersionCompareManager } from "../api/VersionCompareManager.js";
import { updateVersionComparisonTransparencies } from "../api/VersionCompareTiles.js";
import { Row } from "@itwin/itwinui-react/react-table";
import "./PropertyComparisonTable.scss";


type TableProps<T extends Record<string, unknown>> = React.ComponentProps<typeof Table<T>>;

export interface PropertyComparisonTableProps {
  manager: VersionCompareManager;

  /** KeySet of the selection to display results for in the table. */
  selection?: KeySet;

  isSideBySide?: boolean | undefined;

  onSideBySideToggle?: (() => void) | undefined;

  displaySideBySideToggle?: boolean | undefined;
}

export function PropertyComparisonTable(props: PropertyComparisonTableProps): ReactElement {
  // Throw if context is not provided
  useVersionCompare();

  const { manager, selection } = props;
  const displaySideBySideToggle = props.displaySideBySideToggle || manager.options.displaySideBySideToggle;

  const columns = useColumnsDefinition(manager.currentVersion?.displayName, manager.targetVersion?.displayName);
  const changedElement = useChangedElement(manager.changedElementsManager, selection);
  const dataProviders = useDataProviders(manager);
  const comparisonData = useComparisonData(dataProviders, selection);

  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const handleShowChangedOnlyToggle = () => {
    setShowChangedOnly((prev) => !prev);
  };

  const tableData = useMemo(
    () => {
      if (!comparisonData) {
        return [];
      }

      if (!showChangedOnly) {
        return [...comparisonData.values()];
      }

      const changedRows = [];
      for (const row of comparisonData.values()) {
        if (row.current !== row.target) {
          changedRows.push(row);
        }
      }

      return changedRows;
    },
    [comparisonData, showChangedOnly],
  );

  const navigation = useChangedPropertyNavigation(tableData);

  return (
    <div className="property-comparison-table">
      <div className="property-comparison-table-header">
        <div className="header-element-label">
          <Text className="header-element-label-text" variant="leading" title={changedElement?.label}>
            {changedElement?.label}
          </Text>
          {manager.wantTypeOfChange && changedElement && <ElementChanges changedElement={changedElement} />}
        </div>
        {
          !props.isSideBySide &&
          <OverviewOpacitySlider
            currentVersion={manager.currentVersion?.displayName}
            targetVersion={manager.targetVersion?.displayName}
          />
        }
        <div className="settings">
          {
            (displaySideBySideToggle ?? true) &&
            <SideBySideToggle
              manager={manager}
              selection={selection}
              isSideBySide={props.isSideBySide}
              onSideBySideToggle={props.onSideBySideToggle}
            />
          }
          <ToggleSwitch
            label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.onlyChangedProps")}
            checked={showChangedOnly}
            onChange={handleShowChangedOnlyToggle}
          />
        </div>
        <div className="property-navigation">
          <IconButton
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.scrollToChangedProperty")}
            styleType="borderless"
            disabled={!navigation}
            onClick={navigation?.goToPreviousChange}
          >
            <SvgChevronUp />
          </IconButton>
          <IconButton
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.scrollToChangedProperty")}
            styleType="borderless"
            disabled={!navigation}
            onClick={navigation?.goToNextChange}
          >
            <SvgChevronDown />
          </IconButton>
        </div>
      </div>
      <Table<ComparisonDataRow>
        style={{ height: "100%" }}
        isLoading={comparisonData === undefined}
        emptyTableContent={
          IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noChangedProperties")
        }
        columns={columns}
        data={tableData}
        rowProps={getRowProps}
        getRowId={(row) => row.id}
        isSelectable
        selectionMode="single"
        onSelect={navigation?.handleRowSelect}
        density="extra-condensed"
        stateReducer={navigation?.stateReducer}
        scrollToRow={navigation?.scrollToRow}
      />
    </div>
  );
}

type Column<T extends Record<string, unknown>> = TableProps<T>["columns"] extends ReadonlyArray<infer U> ? U : never;

function useColumnsDefinition(
  currentVersion: string | undefined,
  targetVersion: string | undefined,
): Array<Column<ComparisonDataRow>> {
  return useMemo(
    () => {
      const defaultLabel = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.version");
      const currentVersionSuffix = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.currentVersionSuffix",
      );
      const currentLabel = `${currentVersion || defaultLabel} ${currentVersionSuffix}`;
      const targetLabel = targetVersion || defaultLabel;
      return [
        {
          id: "category",
          Header: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.category"),
          accessor: "category",
        },
        {
          id: "propertyName",
          Header: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.property"),
          accessor: "propertyName",
        },
        {
          id: "current",
          Header: currentLabel,
          accessor: "current",
        },
        {
          id: "target",
          Header: targetLabel,
          accessor: "target",
        },
      ] satisfies Array<Column<ComparisonDataRow>>;
    },
    [currentVersion, targetVersion],
  );
}

interface DataProviders {
  currentVersionDataProvider: PresentationPropertyDataProvider;
  targetVersionDataProvider: PresentationPropertyDataProvider;
}

function useDataProviders(manager: VersionCompareManager): DataProviders | undefined {
  const [dataProviders, setDataProviders] = useState<DataProviders>();

  useEffect(
    () => {
      const handleVersionCompareStarted = (currentIModel: IModelConnection, targetIModel: IModelConnection) => {
        const currentVersionDataProvider = new PresentationPropertyDataProvider({ imodel: currentIModel });
        const targetVersionDataProvider = new PresentationPropertyDataProvider({ imodel: targetIModel });
        setDataProviders({ currentVersionDataProvider, targetVersionDataProvider });
      };

      const handleVersionCompareStopped = () => {
        setDataProviders(undefined);
      };

      manager.versionCompareStarted.addListener(handleVersionCompareStarted);
      manager.versionCompareStopped.addListener(handleVersionCompareStopped);

      // In case we already missed comparison start event
      if (manager.isComparing && manager.currentIModel && manager.targetIModel) {
        handleVersionCompareStarted(manager.currentIModel, manager.targetIModel);
      }

      return () => {
        manager.versionCompareStarted.removeListener(handleVersionCompareStarted);
        manager.versionCompareStopped.removeListener(handleVersionCompareStopped);
      };
    },
    [manager],
  );

  useEffect(
    () => {
      if (!dataProviders) {
        return;
      }

      return () => {
        dataProviders.currentVersionDataProvider.dispose();
        dataProviders.targetVersionDataProvider.dispose();
      };
    },
    [dataProviders],
  );

  return dataProviders;
}

function useChangedElement(
  changedElementsManager: ChangedElementsManager,
  selection: KeySet | undefined,
): ChangedElementEntry | undefined {
  const [changedElement, setChangedElement] = useState<ChangedElementEntry>();

  useEffect(
    () => {
      let disposed = false;
      void (async () => {
        if (selection?.instanceKeysCount !== 1) {
          return;
        }

        const selectedId = [...[...selection.instanceKeys.values()][0]][0];
        let entries = await changedElementsManager.entryCache.get([selectedId]);
        if (disposed || entries.length !== 1) {
          return;
        }

        if (changedElementsManager.labels !== undefined) {
          entries = await changedElementsManager.labels.populateEntries(entries);
        }

        if (!disposed) {
          setChangedElement(entries[0]);
        }
      })();

      return () => { disposed = true; };
    },
    [changedElementsManager, selection],
  );

  return changedElement;
}

interface ComparisonDataRow {
  id: string;
  category: string;
  propertyName: string;
  current: string;
  target: string;

  [key: string]: unknown;
}

function useComparisonData(
  dataProviders: DataProviders | undefined,
  selection: KeySet | undefined,
): ComparisonDataRow[] | undefined {
  const [comparisonData, setComparisonData] = useState<ComparisonDataRow[]>();

  useEffect(
    () => {
      let disposed = false;

      void (async () => {
        if (!dataProviders || !selection) {
          return;
        }

        setComparisonData(undefined);

        dataProviders.currentVersionDataProvider.keys = selection;
        dataProviders.targetVersionDataProvider.keys = selection;

        const [currentProperties, targetProperties] = await Promise.all([
          getProperties(dataProviders.currentVersionDataProvider),
          getProperties(dataProviders.targetVersionDataProvider),
        ]);

        if (disposed) {
          return;
        }

        const rowIdToRow = new Map<string, ComparisonDataRow>();
        for (const row of currentProperties) {
          rowIdToRow.set(
            row.id,
            {
              id: row.id,
              category: row.category,
              propertyName: row.propertyName,
              current: row.value,
              target: "",
            },
          );
        }

        for (const row of targetProperties) {
          const entry = rowIdToRow.get(row.id) ?? {
            id: row.id,
            category: row.category,
            propertyName: row.propertyName,
            current: "",
            target: "",
          };
          entry.target = row.value;
          rowIdToRow.set(row.id, entry);
        }

        setComparisonData([...rowIdToRow.values()]);
      })();

      return () => { disposed = true; };
    },
    [dataProviders, selection],
  );

  return comparisonData;
}

async function getProperties(dataProvider: PresentationPropertyDataProvider | undefined) {
  const data = await dataProvider?.getData().catch(() => undefined);
  return data ? getFlattenedProperties(data) : [];
}

const loggerCategory = "VersionCompare:PropertyComparisonTable";

interface SingleComparisonData {
  id: string;
  category: string;
  propertyName: string;
  value: string;
}

/**
 *  Flattens the property data into an array and prefixes property names so that user is aware of where they come from.
 */
function getFlattenedProperties(data: PropertyData): SingleComparisonData[] {
  const rows: SingleComparisonData[] = [];

  const processCategory = ({ name, label, childCategories }: PropertyCategory) => {
    if (data.records[name]) {
      data.records[name].forEach((value) => processPropertyRecord(rows, label, value));
    } else {
      Logger.logWarning(loggerCategory, `No records found with category name: ${name}`);
    }

    for (const childCategory of childCategories ?? []) {
      processCategory(childCategory);
    }
  };

  for (const category of data.categories) {
    if (category.name !== "Favorite") {
      processCategory(category);
    }
  }

  return rows;
}

function processPropertyRecord(
  rows: SingleComparisonData[],
  currentCategory: string,
  record: PropertyRecord,
  propertyPrefix?: string,
): void {
  switch (record.value.valueFormat) {
    case PropertyValueFormat.Primitive:
      {
        const propertyName = (propertyPrefix ? propertyPrefix + " - " : "") + record.property.displayLabel;
        rows.push({
          id: `${currentCategory}.${propertyName}`,
          category: currentCategory,
          propertyName,
          value: record.value.displayValue ?? "",
        });
        break;
      }

    case PropertyValueFormat.Array:
      for (const valueRecord of record.value.items) {
        processPropertyRecord(
          rows,
          currentCategory,
          valueRecord,
          (propertyPrefix ? propertyPrefix + " - " : "") + record.property.displayLabel,
        );
      }

      break;

    case PropertyValueFormat.Struct:
      for (const memberValue of Object.values(record.value.members)) {
        processPropertyRecord(
          rows,
          currentCategory,
          memberValue,
          (propertyPrefix ? propertyPrefix + " - " : "") + record.property.displayLabel,
        );
      }

      break;
  }
}

interface ChangedPropertyNavigation {
  stateReducer: TableStateReducer;
  handleRowSelect: (selectedData: ComparisonDataRow[] | undefined) => void;
  goToNextChange: () => void;
  goToPreviousChange: () => void;
  scrollToRow: TableProps<ComparisonDataRow>["scrollToRow"];
}

type TableInstance = Parameters<TableStateReducer>[3];
type TableStateReducer = Required<TableProps<ComparisonDataRow>>["stateReducer"];


function useChangedPropertyNavigation(tableData: ComparisonDataRow[]): ChangedPropertyNavigation | undefined {
  const tableInstance = useRef<TableInstance>();
  const selectedRow = useRef<number>(-1);
  const [scrollToRow, setScrollToRow] = useState<() => number>();

  const constantProperties = useMemo(
    () => ({
      stateReducer: (newState, _action, _previousState, instance) => {
        tableInstance.current = instance;
        return newState;
      },
    }) satisfies Partial<ChangedPropertyNavigation>,
    [],
  );

  const navigation = useMemo(
    () => {
      let bounds: { firstChangedRow: number; lastChangedRow: number; } | undefined;
      let currentRow = -1;
      for (const row of tableData) {
        currentRow += 1;
        if (row.current !== row.target) {
          bounds ??= { firstChangedRow: currentRow, lastChangedRow: currentRow };
          bounds.lastChangedRow = currentRow;
        }
      }

      if (!bounds) {
        return undefined;
      }

      const { firstChangedRow, lastChangedRow } = bounds;

      return {
        handleRowSelect: (rows) => {
          selectedRow.current = rows ? tableData.indexOf(rows[0]) : -1;
        },
        goToNextChange: () => {
          const prevSelectedRow = selectedRow.current;
          tableInstance.current?.toggleAllRowsSelected(false);
          const newSelectedRow = findNextChangedRow(tableData, prevSelectedRow, firstChangedRow, lastChangedRow);
          tableInstance.current?.toggleRowSelected(tableData[newSelectedRow].id, true);
          setScrollToRow(() => () => newSelectedRow);
        },
        goToPreviousChange: () => {
          const prevSelectedRow = selectedRow.current;
          tableInstance.current?.toggleAllRowsSelected(false);
          const newSelectedRow = findPreviousChangedRow(tableData, prevSelectedRow, firstChangedRow, lastChangedRow);
          tableInstance.current?.toggleRowSelected(tableData[newSelectedRow].id, true);
          setScrollToRow(() => () => newSelectedRow);
        },
      } satisfies Partial<ChangedPropertyNavigation>;
    },
    [tableData],
  );

  if (!navigation) {
    return undefined;
  }

  return {
    ...constantProperties,
    ...navigation,
    scrollToRow,
  };
}

function findNextChangedRow(
  tableData: ComparisonDataRow[],
  selectedRow: number,
  firstChangedRow: number,
  lastChangedRow: number,
): number {
  if (selectedRow < firstChangedRow || lastChangedRow <= selectedRow) {
    return firstChangedRow;
  }

  let currentRow = selectedRow;
  while (currentRow < lastChangedRow) {
    currentRow += 1;
    if (tableData[currentRow].current !== tableData[currentRow].target) {
      return currentRow;
    }
  }

  return lastChangedRow;
}

function findPreviousChangedRow(
  tableData: ComparisonDataRow[],
  selectedRow: number,
  firstChangedRow: number,
  lastChangedRow: number,
): number {
  if (selectedRow <= firstChangedRow || lastChangedRow < selectedRow) {
    return lastChangedRow;
  }

  let currentRow = selectedRow;
  while (currentRow > firstChangedRow) {
    currentRow -= 1;
    if (tableData[currentRow].current !== tableData[currentRow].target) {
      return currentRow;
    }
  }

  return firstChangedRow;
}

interface ElementChangesProps {
  changedElement: ChangedElementEntry;
}

const ElementChanges = memo(
  function ElementChanges(props: ElementChangesProps): ReactElement {
    const changeTypeInfo = getTypeOfChangeTooltip(props.changedElement);
    return (
      <Text className="header-change-type" variant="small" title={changeTypeInfo}>
        {changeTypeInfo}
      </Text>
    );
  },
);

interface OverviewOpacitySliderProps {
  currentVersion?: string | undefined;
  targetVersion?: string | undefined;
}

function OverviewOpacitySlider(props: OverviewOpacitySliderProps) {
  return (
    <Slider
      min={0}
      max={100}
      values={[50]}
      onUpdate={handleOpacitySliderChange}
      minLabel={props.currentVersion}
      maxLabel={props.targetVersion}
      tooltipProps={() => ({ visible: false })}
    />
  );
}

function handleOpacitySliderChange(values: readonly number[]): void {
  const vp = IModelApp.viewManager.getFirstOpenView();
  if (vp !== undefined) {
    const current = values[0] / 100.0;
    const target = 1.0 - current;
    updateVersionComparisonTransparencies(vp, current, target);
  }
}

interface SideBySideToggleProps {
  manager: VersionCompareManager;
  selection: KeySet | undefined;
  isSideBySide?: boolean | undefined;
  onSideBySideToggle?: () => void | undefined;
}

function SideBySideToggle(props: SideBySideToggleProps): ReactElement {
  return (
    <ToggleSwitch
      label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.sideBySide")}
      checked={props.isSideBySide}
      onChange={props.onSideBySideToggle}
    />
  );
}

const getRowProps: (row: Row<ComparisonDataRow>) => React.ComponentPropsWithRef<"div"> & {
  isLoading?: boolean;
} = (row) => {
  const { current, target } = row.values;
  if (current === "" && target !== "") {
    return { className:"removed-row" };
  }

  if (current !== "" && target === "") {
    return { className: "added-row" };
  }

  if (current !== target) {
    return { className: "modified-row"};
  }

  return {};
};

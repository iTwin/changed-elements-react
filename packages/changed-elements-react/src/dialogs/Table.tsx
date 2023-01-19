/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { CSSProperties, useEffect, type PropsWithChildren, type ReactElement } from "react";
import {
  useFlexLayout, useGlobalFilter, useMountedLayoutEffect, useSortBy, useTable, type HeaderGroup, type Row,
  type SortingRule, type TableOptions
} from "react-table";
import AutoSizer, { type Size } from "react-virtualized-auto-sizer";
import { FixedSizeList, type ListChildComponentProps } from "react-window";

import "./Table.scss";

export interface Table<T extends object = Record<string, unknown>> extends TableOptions<T> {
  searchText: string;
  columnSortBy?: Array<SortingRule<T>>;
  onRowsChanged?: (rows: Row<T>[]) => void;
}

export function Table<T extends object>(props: PropsWithChildren<Table<T>>): ReactElement {
  const { columns, columnSortBy, onRowsChanged, searchText } = props;

  const instance = useTable<T>(
    {
      ...props,
      columns,
      disableSortRemove: true,
      autoResetSortBy: false,
      initialState: {
        sortBy: columnSortBy ? columnSortBy : [],
      },
    },
    useFlexLayout,
    useGlobalFilter,
    useSortBy,
  );

  const {
    getTableProps,
    rows,
    setHiddenColumns,
    allColumns,
    setGlobalFilter,
    headerGroups,
    getTableBodyProps,
    prepareRow,
  } = instance;

  useEffect(() => {
    const hiddenColumns = allColumns
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((column: any) => column.hidden)
      .map((column) => column.id);
    setHiddenColumns(hiddenColumns);
  }, [allColumns, setHiddenColumns]);

  useEffect(() => {
    setGlobalFilter(searchText);
  }, [searchText, rows, setGlobalFilter]);

  useMountedLayoutEffect(() => {
    onRowsChanged?.(rows);
  }, [rows]);

  const getCellStyle = (align: "left" | "right" | "center" | undefined) => {
    return {
      justifyContent:
        align === "right"
          ? "flex-end"
          : align === "center"
            ? "center"
            : "flex-start",
      display: "flex",
    };
  };

  const getColumnStyle = (align: "left" | "right" | "center" | undefined) => {
    return {
      justifyContent:
        align === "right"
          ? "flex-end"
          : align === "center"
            ? "center"
            : "flex-start",
      display: "flex",
      width: "100%",
    };
  };

  const renderRow = (p: ListChildComponentProps) => {
    const { index, style } = p;

    const row = rows[index];
    if (!row) {
      if (rows.length === 0) {
        return <div />;
      }
      return <div className="themedTableTrSkeleton" style={style} />;
    }

    prepareRow(row);
    return (
      <div className="themedTableTr" {...row.getRowProps({ style })}>
        {row.cells.map((cell, index) => {
          return (
            <div
              className="themedTableTd"
              {...cell.getCellProps({
                style: getCellStyle(cell.column.align),
              })}
              key={"cell" + index}
            >
              {cell.render("Cell")}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="themedTableContainer">
      <div className="themedTable" {...getTableProps()}>
        <div>
          {headerGroups.map((headerGroup: HeaderGroup<T>, i: number) => (
            <div
              className="themedTableHr"
              {...headerGroup.getHeaderGroupProps()}
              key={i}
            >
              {headerGroup.headers.map((column) => {
                return (
                  <div
                    className={`themedTableTh styledTableHeaderCellSticky ${column.isSorted ? "styledTableHeaderCellSorted" : ""}`}
                    {...column.getHeaderProps(column.getSortByToggleProps())}
                  >
                    <div style={getColumnStyle(column.align)}>
                      {column.render("Header")}
                      {/* Add a sort direction indicator */}
                      {column.isSorted && (
                        <span
                          className={`sortIndicator icon ${column.isSortedDesc ? "icon-sort-down" : "icon-sort-up"}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="themedTableTbody" {...getTableBodyProps()}>
          <AutoSizer>
            {({ width, height }: Size) => (
              <FixedSizeList
                height={height}
                width={width}
                itemCount={rows.length}
                itemSize={40}
              >
                {renderRow}
              </FixedSizeList>
            )}
          </AutoSizer>
        </div>
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/ban-types */

declare module "react-table" {
  interface UseFlexLayoutInstanceProps {
    totalColumnsMinWidth: number;
  }

  interface UseFlexLayoutColumnProps {
    totalMinWidth: number;
  }

  interface TableOptions<D extends object>
    extends UseExpandedOptions<D>,
    UseFiltersOptions<D>,
    UseFiltersOptions<D>,
    UseGlobalFiltersOptions<D>,
    UseGroupByOptions<D>,
    UsePaginationOptions<D>,
    UseResizeColumnsOptions<D>,
    UseRowSelectOptions<D>,
    UseSortByOptions<D> { }

  interface Hooks<D extends object = {}>
    extends UseExpandedHooks<D>,
    UseGroupByHooks<D>,
    UseRowSelectHooks<D>,
    UseSortByHooks<D> { }

  interface TableInstance<D extends object = {}>
    extends UseColumnOrderInstanceProps<D>,
    UseExpandedInstanceProps<D>,
    UseFiltersInstanceProps<D>,
    UseGlobalFiltersInstanceProps<D>,
    UseGroupByInstanceProps<D>,
    UsePaginationInstanceProps<D>,
    UseRowSelectInstanceProps<D>,
    UseFlexLayoutInstanceProps,
    UsePaginationInstanceProps<D>,
    UseSortByInstanceProps<D> { }

  interface TableState<D extends object = {}>
    extends UseColumnOrderState<D>,
    UseExpandedState<D>,
    UseFiltersState<D>,
    UseGlobalFiltersState<D>,
    UseGroupByState<D>,
    UsePaginationState<D>,
    UseResizeColumnsState<D>,
    UseRowSelectState<D>,
    UseSortByState<D> {
    rowCount: number;
  }

  interface ColumnInterface<D extends object = {}>
    extends UseFiltersColumnOptions<D>,
    UseGroupByColumnOptions<D>,
    UseResizeColumnsColumnOptions<D>,
    UseSortByColumnOptions<D> {
    align?: "left" | "right" | "center" | undefined;
    collapse?: boolean;
    style?: CSSProperties;
  }

  interface ColumnInstance<D extends object = {}>
    extends UseFiltersColumnProps<D>,
    UseGroupByColumnProps<D>,
    UseResizeColumnsColumnProps<D>,
    UseFlexLayoutColumnProps,
    UseSortByColumnProps<D> { }

  interface Row<D extends object = {}>
    extends UseExpandedRowProps<D>,
    UseGroupByRowProps<D>,
    UseRowSelectRowProps<D> { }
}

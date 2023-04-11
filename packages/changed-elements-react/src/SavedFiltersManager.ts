/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { EventEmitter } from "./common.js";

export interface SavedFiltersManager {
  /** Raised when any filter data is changed. */
  onFiltersChanged: EventEmitter<() => void>;
  getFilters(): Promise<FilterData[]>;
  getFilterByName(name: string): Promise<FilterData | undefined>;
  deleteFilter(data: FilterData): Promise<boolean>;
  renameFilter(data: FilterData, newName: string): Promise<boolean>;
  saveFilter(name: string, shared: boolean, filter: FilterOptions): Promise<boolean>;
  updateFilter(data: FilterData, shared: boolean, filter: FilterOptions): Promise<boolean>;
}

export interface FilterData {
  /** Filter identifier. */
  id: string;

  /** Filter display name. */
  name: string;

  /** Filter settings. */
  filter: FilterOptions;

  /** Whether this filter is shared with other users. */
  shared: boolean;

  /** Whether editing this filter is allowed. */
  editable: boolean;
}

export interface FilterOptions {
  wantAdded: boolean;
  wantDeleted: boolean;
  wantModified: boolean;
  wantUnchanged: boolean;
  wantedTypeOfChange: number;
  wantedProperties: Map<string, boolean>;
}

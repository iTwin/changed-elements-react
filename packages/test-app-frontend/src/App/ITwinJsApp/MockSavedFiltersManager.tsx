/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { FilterData, FilterOptions, SavedFiltersManager } from "@itwin/changed-elements-react";
import { BeEvent } from "@itwin/core-bentley";

export class MockSavedFiltersManager implements SavedFiltersManager {
  private filters = new Map<string, FilterData>([
    [
      "Minimal filter",
      {
        id: "1",
        name: "Minimal filter",
        filter: {
          wantAdded: false,
          wantDeleted: false,
          wantModified: false,
          wantUnchanged: false,
          wantedTypeOfChange: 1,
          wantedProperties: new Map(),
        },
        shared: false,
        editable: false,
      },
    ],
    [
      "Shared filter",
      {
        id: "2",
        name: "Shared filter",
        filter: {
          wantAdded: true,
          wantDeleted: false,
          wantModified: false,
          wantUnchanged: false,
          wantedTypeOfChange: 1,
          wantedProperties: new Map(),
        },
        shared: true,
        editable: false,
      },
    ],
    [
      "Editable filter",
      {
        id: "3",
        name: "Editable filter",
        filter: {
          wantAdded: true,
          wantDeleted: true,
          wantModified: true,
          wantUnchanged: true,
          wantedTypeOfChange: 1,
          wantedProperties: new Map(),
        },
        shared: false,
        editable: true,
      },
    ],
  ]);

  private incrementalFilterId = this.filters.size;

  public onFiltersChanged = new BeEvent();

  public async getFilters(): Promise<FilterData[]> {
    return [...this.filters.values()];
  }

  public async getFilterByName(name: string): Promise<FilterData | undefined> {
    return this.filters.get(name);
  }

  public async deleteFilter(data: FilterData): Promise<boolean> {
    if (this.filters.delete(data.name)) {
      this.onFiltersChanged.raiseEvent();
      return true;
    }

    return false;
  }

  public async renameFilter(data: FilterData, newName: string): Promise<boolean> {
    if (!this.filters.delete(data.name)) {
      return false;
    }

    this.filters.set(newName, { ...data, name: newName });
    this.onFiltersChanged.raiseEvent();
    return true;
  }

  public async saveFilter(name: string, shared: boolean, filter: FilterOptions): Promise<boolean> {
    this.filters.set(
      name,
      {
        id: (++this.incrementalFilterId).toString(),
        name,
        filter,
        shared,
        editable: true,
      },
    );
    this.onFiltersChanged.raiseEvent();
    return true;
  }

  public async updateFilter(data: FilterData, shared: boolean, filter: FilterOptions): Promise<boolean> {
    const entry = this.filters.get(data.name);
    if (!entry) {
      return false;
    }

    entry.filter = filter;
    entry.shared = shared;
    this.onFiltersChanged.raiseEvent();
    return true;
  }
}

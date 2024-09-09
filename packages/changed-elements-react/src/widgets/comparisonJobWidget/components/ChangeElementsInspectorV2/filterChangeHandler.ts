
import { InstanceKey } from "@itwin/presentation-common";
import { FilterOptions } from "../../../../SavedFiltersManager";
import { ChangedElementEntry } from "../../../../api/ChangedElementEntryCache";
import { VersionCompareManager } from "../../../../api/VersionCompareManager";
import { TypeOfChange } from "@itwin/core-common";
import { DbOpcode } from "@itwin/core-bentley";

type handelFilterChangeParams = {
  instanceKeys: InstanceKey[];
  setFilteredInstanceKeysOfChangedElements: (instanceKeys: InstanceKey[]) => void;
  setFilterOptions: (options: FilterOptions) => void;
  manager: VersionCompareManager;
};

export function handleFilterChange({ instanceKeys, setFilteredInstanceKeysOfChangedElements, setFilterOptions, manager }: handelFilterChangeParams) {
  return async (options: FilterOptions) => {
    const filteredEcInstanceIds = getFilteredEcInstanceIds(options, instanceKeys, manager);
    setFilteredInstanceKeysOfChangedElements(filteredEcInstanceIds ?? []);
    await setVisualization(filteredEcInstanceIds, manager);
    const visualizationManager = manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager) {
      await visualizationManager.toggleUnchangedVisibility(!options.wantUnchanged);
    }
    setFilterOptions(options);
  };
}

//todo remove export when models tree can display all changed elements
export const setVisualization = async (InstanceKeys: InstanceKey[] | undefined, manager: VersionCompareManager) => {
  const visualizationManager = manager.visualization?.getSingleViewVisualizationManager();
  if (InstanceKeys === undefined) {
    // Visualize no focused elements
    if (visualizationManager) {
      await visualizationManager.setFocusedElements([]);
    }
  }
  const changedElementsEntries = new Array<ChangedElementEntry>();
  InstanceKeys?.forEach((ecInstanceId) => {
    const changeElement = manager.changedElementsManager.allChangeElements.get(ecInstanceId.id);
    const entry: ChangedElementEntry = {
      ...(manager.changedElementsManager.entryCache.getSynchronous(ecInstanceId.id) ?? {
        loaded: true,
        id: ecInstanceId.id,
        classId: changeElement!.classId,
        opcode: changeElement!.opcode,
        type: changeElement!.type,
      }),
    };
    entry.loaded = true;
    changedElementsEntries.push(entry);
  });
  if (visualizationManager) {
    await visualizationManager.setFocusedElements(changedElementsEntries);
  }
};

export const makeDefaultFilterOptions = (propertyNames: Set<string>): FilterOptions => {
  const wantedProperties = new Map<string, boolean>();
  // Set all properties as visible as default
  for (const prop of propertyNames) {
    wantedProperties.set(prop, true);
  }

  return {
    wantAdded: true,
    wantDeleted: true,
    wantModified: true,
    wantUnchanged: true,
    // Turn off TypeOfChange.Hidden by default
    wantedTypeOfChange: typeOfChangeAll() & ~TypeOfChange.Hidden,
    wantedProperties,
  };
};



const typeOfChangeAll = (): number => {
  return (
    TypeOfChange.Geometry |
    TypeOfChange.Hidden |
    TypeOfChange.Indirect |
    TypeOfChange.Placement |
    TypeOfChange.Property
  );
};

const allPropertiesVisible = (properties: Map<string, boolean>): boolean => {
  for (const pair of properties) {
    if (pair[1] === false) {
      return false;
    }
  }

  return true;
};

const isDefaultFilterOptions = (options: FilterOptions): boolean => {
  return (
    options.wantAdded === true &&
    options.wantDeleted === true &&
    options.wantModified === true &&
    options.wantUnchanged === true &&
    options.wantedTypeOfChange === typeOfChangeAll() &&
    allPropertiesVisible(options.wantedProperties)
  );
};

const getFilteredEcInstanceIds = (options: FilterOptions, ecInstanceIds: InstanceKey[], manager: VersionCompareManager) => {
  if (isDefaultFilterOptions(options))
    return undefined;
  return ecInstanceIds.filter((ecInstanceId) => {
    const changeElement = manager.changedElementsManager.allChangeElements.get(ecInstanceId.id);
    if (changeElement) {
      const entry: ChangedElementEntry = {
        ...(manager.changedElementsManager.entryCache.getSynchronous(ecInstanceId.id) ?? {
          loaded: true,
          id: ecInstanceId.id,
          classId: changeElement.classId,
          opcode: changeElement.opcode,
          type: changeElement.type,
        }),
      };
      if (options.wantAdded && changeElement.opcode === DbOpcode.Insert && entryMatchesFilters(entry, options, manager)) {
        return true;
      }
      if (options.wantDeleted && changeElement.opcode === DbOpcode.Delete && entryMatchesFilters(entry, options, manager)) {
        return true;
      }
      entry.loaded = true;
      if (options.wantModified && changeElement.opcode === DbOpcode.Update && entryMatchesFilters(entry, options, manager)) {
        return true;
      }
    }
    return false;
  });
};

const entryMatchesFilters = (entry: ChangedElementEntry, options: FilterOptions, manager: VersionCompareManager): boolean => {
  if (!manager.wantTypeOfChange) {
    return true;
  }
  if (entry.indirect !== undefined && entry.indirect) {
    return false;
  }
  if ((options.wantedTypeOfChange & entry.type) === 0) {
    return false;
  }

  if (!manager.wantPropertyFiltering) {
    return true;
  }
  if ((entry.type & (TypeOfChange.Property | TypeOfChange.Indirect)) === 0) {
    return true;
  }

  return anyEntryPropertiesVisible(entry, options);
};

const anyEntryPropertiesVisible = (entry: ChangedElementEntry, options: FilterOptions): boolean => {
  if (entry.properties === undefined) {
    // Shouldn't happen
    return true;
  }

  for (const prop of entry.properties) {
    const visible = options.wantedProperties.get(prop[0]);
    if (visible !== undefined && visible === true) {
      return true;
    }
  }

  return false;
};

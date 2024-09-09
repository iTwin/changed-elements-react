/* eslint-disable react/prop-types */
import { VersionCompareManager } from "../../../../api/VersionCompareManager";
import { DbOpcode } from "@itwin/core-bentley";
import { useCallback, useMemo, useState } from "react";
import { IModelConnection, Viewport } from "@itwin/core-frontend";
import { useModelsTreeButtonProps, TreeWithHeader, ModelsTreeComponent, VisibilityTree, VisibilityTreeRenderer, useModelsTree } from "@itwin/tree-widget-react";
import { createStorage, SelectionStorage } from "@itwin/unified-selection";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import React from "react";
import { ModeOptions, ModeSelector } from "./ModeSelector";
import { CreateNodeLabelComponentProps, CustomModelsTreeRendererProps } from "./models/modelsTreeAndNodeTypes";
import { FilterOptions } from "../../../../SavedFiltersManager";
import ChangeTypeFilterHeader from "../../../ChangeTypeFilterHeader";
import { ChangedElementEntry } from "../../../../api/ChangedElementEntryCache";
import { TypeOfChange } from "@itwin/core-common";
import { type InstanceKey } from '@itwin/presentation-common';
import NodeLabelCreator from "./NodeLabelComponents/NodeLabelCreator";

let unifiedSelectionStorage: SelectionStorage | undefined;
const schemaContextCache = new Map<string, SchemaContext>();

// The Models tree requires a unified selection storage to support selection synchronization with the
// application. The storage should be created once per application and shared across multiple selection-enabled
// components.
function getUnifiedSelectionStorage(): SelectionStorage {
  if (!unifiedSelectionStorage) {
    unifiedSelectionStorage = createStorage();
    IModelConnection.onClose.addListener((imodel) => {
      unifiedSelectionStorage!.clearStorage({ imodelKey: imodel.key });
    });
  }
  return unifiedSelectionStorage;
}

// Schema context is used by Models tree to access iModels metadata. Similar to selection storage, it should be
// created once per application and shared across multiple components.
function getSchemaContext(imodel: IModelConnection): SchemaContext {
  const key = imodel.getRpcProps().key;
  let schemaContext = schemaContextCache.get(key);
  if (!schemaContext) {
    const schemaLocater = new ECSchemaRpcLocater(imodel.getRpcProps());
    schemaContext = new SchemaContext();
    schemaContext.addLocater(schemaLocater);
    schemaContextCache.set(key, schemaContext);
    imodel.onClose.addOnce(() => schemaContextCache.delete(key));
  }
  return schemaContext;
}

export type ChangedElementsInspectorV2Props = {
  manager: VersionCompareManager;
  current: IModelConnection;
  currentVP: Viewport;
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

function ChangedElementsInspectorV2(v2InspectorProps: Readonly<ChangedElementsInspectorV2Props>) {
  const buttonProps = useModelsTreeButtonProps({ imodel: v2InspectorProps.current, viewport: v2InspectorProps.currentVP });
  const [mode, setMode] = useState<ModeOptions>("enable");
  const propertyNames = v2InspectorProps.manager.changedElementsManager.getAllChangedPropertyNames();
  const defaultOptions = makeDefaultFilterOptions(propertyNames);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(defaultOptions);
  const [searchedText, setSearchedText] = useState<string>("");
  const instanceKeys = useMemo(() => {
    const entries = Array.from(v2InspectorProps.manager.changedElementsManager.filteredChangedElements.keys());
    const instanceKeys = entries
      .map((key) => {
        const instanceKey = v2InspectorProps.manager.changedElementsManager.elementIdAndInstanceKeyMap.get(key);
        return instanceKey ? instanceKey : null;
      })
      .filter((instanceKey): instanceKey is { className: string; id: string; } => instanceKey !== null && instanceKey.className.includes("IFC"))
      .slice(0, 800); //todo remove slice when models tree allows for greater than 1000 instance key filter
    void setVisualization(instanceKeys, v2InspectorProps.manager); //todo remove when models tree allows for greater than 100 instance key filter
    return instanceKeys;
  }, [v2InspectorProps.manager]);
  const [filteredInstanceKeysOfChangedElements, setFilteredInstanceKeysOfChangedElements] = useState<InstanceKey[]>(instanceKeys);

  const modeSelectorProps = {
    onChange: (value: React.SetStateAction<ModeOptions>) => {
      setMode(value);
    },
    options: [
      { label: "Enable Class Grouping", value: "enable" },
      { label: "Disable Class Grouping", value: "disable" },
    ] as { label: string; value: ModeOptions; }[],
    inputProps: { placeholder: "Enable Class Grouping" },
  };
  const { modelsTreeProps, rendererProps } = useModelsTree({
    activeView: v2InspectorProps.currentVP,
    hierarchyConfig: { elementClassGrouping: mode },
    getFilteredPaths: useCallback(async function ({ createInstanceKeyPaths }) {
      const instanceKeyPaths = await createInstanceKeyPaths({
        targetItems: filteredInstanceKeysOfChangedElements // Adjust this based on your actual target items
      });
      return instanceKeyPaths;
    }, [filteredInstanceKeysOfChangedElements]),
    filter: useMemo(() => searchedText, [searchedText]),
  });

  function CustomModelsTreeRenderer(props: CustomModelsTreeRendererProps) {
    const getLabel = useCallback<CreateNodeLabelComponentProps>(NodeLabelCreator({ ...props, ...v2InspectorProps }),
      [props.getLabel],
    );
    return <VisibilityTreeRenderer {...props} getLabel={getLabel} />;
  }
  return (
    <TreeWithHeader
      buttons={[
        <ModelsTreeComponent.ShowAllButton {...buttonProps} key={"abc123"} />,
        <ModelsTreeComponent.HideAllButton {...buttonProps} key={"123abc"} />,
        <ChangeTypeFilterHeader key={"123abcde"}
          entries={v2InspectorProps.manager.changedElementsManager.entryCache.getAll()}
          onFilterChange={async function (options: FilterOptions): Promise<void> {
            const filteredEcInstanceIds = getFilteredEcInstanceIds(options, instanceKeys, v2InspectorProps.manager);
            setFilteredInstanceKeysOfChangedElements(filteredEcInstanceIds ?? []);
            await setVisualization(filteredEcInstanceIds, v2InspectorProps.manager);
            const visualizationManager = v2InspectorProps.manager.visualization?.getSingleViewVisualizationManager();
            if (visualizationManager) {
              await visualizationManager.toggleUnchangedVisibility(!options.wantUnchanged);
            }
            setFilterOptions(options);
          }}
          options={filterOptions}
          iModelConnection={v2InspectorProps.current}
          enableDisplayShowAllHideAllButtons={false}
          wantPropertyFiltering={v2InspectorProps.manager.wantPropertyFiltering}
          onSearchChanged={(searchedText) => setSearchedText(searchedText)}
        />,
        <ModeSelector key={"123abcd"} {...modeSelectorProps} />,
      ]
      }>
      <VisibilityTree
        {...modelsTreeProps}
        getSchemaContext={getSchemaContext}
        selectionStorage={getUnifiedSelectionStorage()}
        imodel={v2InspectorProps.current}
        treeRenderer={(props) => <CustomModelsTreeRenderer {...props} {...rendererProps} {...v2InspectorProps} />}
      />
    </TreeWithHeader>
  );
}

const getFilteredEcInstanceIds = (options: FilterOptions, ecInstanceIds: InstanceKey[], manager: VersionCompareManager) => {
  if (isDefaultFilterOptions(options))
    return undefined;
  return ecInstanceIds.filter((ecInstanceId) => {
    const changeElement = manager.changedElementsManager.allChangeElements.get(ecInstanceId.id);
    if (changeElement) {
      if (options.wantAdded && changeElement.opcode === DbOpcode.Insert) {
        return true;
      }
      if (options.wantDeleted && changeElement.opcode === DbOpcode.Delete) {
        return true;
      }
      const entry: ChangedElementEntry = {
        ...(manager.changedElementsManager.entryCache.getSynchronous(ecInstanceId.id) ?? {
          loaded: true,
          id: ecInstanceId.id,
          classId: changeElement.classId,
          opcode: changeElement.opcode,
          type: changeElement.type,
        }),
      };
      entry.loaded = true;
      if (options.wantModified && changeElement.opcode === DbOpcode.Update && modifiedEntryMatchesFilters(entry, options, manager)) {
        return true;
      }
    }
    return false;
  });
};

const makeDefaultFilterOptions = (propertyNames: Set<string>): FilterOptions => {
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

const modifiedEntryMatchesFilters = (entry: ChangedElementEntry, options: FilterOptions, manager: VersionCompareManager): boolean => {
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

const setVisualization = async (InstanceKeys: InstanceKey[] | undefined, manager: VersionCompareManager) => {
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

export default ChangedElementsInspectorV2;

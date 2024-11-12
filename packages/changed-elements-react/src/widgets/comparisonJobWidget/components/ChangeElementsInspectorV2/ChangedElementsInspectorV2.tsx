/* eslint-disable react/prop-types */
import { VersionCompareManager } from "../../../../api/VersionCompareManager";
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
import { type InstanceKey } from '@itwin/presentation-common';
import NodeLabelCreator from "./NodeLabelComponents/NodeLabelCreator";
import { handleFilterChange, makeDefaultFilterOptions, setVisualization } from "./filterChangeHandler";
import { v4 } from 'uuid';
import { ModelsCategoryCache } from "../../../../api/ModelsCategoryCache";

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

function ChangedElementsInspectorV2(v2InspectorProps: Readonly<ChangedElementsInspectorV2Props>) {
  const buttonProps = useModelsTreeButtonProps({ imodel: v2InspectorProps.current, viewport: v2InspectorProps.currentVP });
  const [mode, setMode] = useState<ModeOptions>("enable");
  const propertyNames = v2InspectorProps.manager.changedElementsManager.getAllChangedPropertyNames();
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(makeDefaultFilterOptions(propertyNames));
  const [searchedText, setSearchedText] = useState<string>("");
  const instanceKeys = useMemo(()=>getInstanceKeys(v2InspectorProps.manager), [v2InspectorProps.manager]);
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
    value: mode,
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
        <ModelsTreeComponent.ShowAllButton {...buttonProps} key={v4()} />,
        <ModelsTreeComponent.HideAllButton {...buttonProps} key={v4()} />,
        <ChangeTypeFilterHeader key={v4()}
          entries={v2InspectorProps.manager.changedElementsManager.entryCache.getAll()}
          onFilterChange={handleFilterChange({ instanceKeys, setFilteredInstanceKeysOfChangedElements, setFilterOptions, manager: v2InspectorProps.manager })}
          options={filterOptions}
          iModelConnection={v2InspectorProps.current}
          enableDisplayShowAllHideAllButtons={false}
          wantPropertyFiltering={v2InspectorProps.manager.wantPropertyFiltering}
          onSearchChanged={(searchedText) => setSearchedText(searchedText)}
        />,
        <ModeSelector key={v4()} {...modeSelectorProps} />,
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

const getInstanceKeys = (manager: VersionCompareManager) => {
  const changedElementsManager= manager.changedElementsManager;
  const entries = Array.from(changedElementsManager.filteredChangedElements.keys());
  // filtering on models level may be too high, may need to filter on cat level( how associate cat with element?)
  const ElementInstanceKeys = entries
    .map((key) => {
      const instanceKey = changedElementsManager.elementIdAndInstanceKeyMap.get(key);
      return instanceKey ? instanceKey : null;
    })
    .filter((instanceKey): instanceKey is { className: string; id: string; } => instanceKey !== null)

  void setVisualization(ElementInstanceKeys, manager);
  // todo this work well for first render but what about when I need to do element level filtering? I.E only added elements ?
  return ElementInstanceKeys
}

export default ChangedElementsInspectorV2;

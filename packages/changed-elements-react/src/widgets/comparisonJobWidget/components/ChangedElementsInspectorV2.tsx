/* eslint-disable react/prop-types */
import { Flex } from "@itwin/itwinui-react/esm";
import { VersionCompareManager } from "../../../api/VersionCompareManager";
import { DbOpcode, Id64String } from "@itwin/core-bentley";
import { ModelsCategoryCache } from '../../../api/ModelsCategoryCache';
import { ComponentPropsWithoutRef, useCallback, useEffect, useState } from "react";
import { IModelConnection, Viewport } from "@itwin/core-frontend";
import "./styles/ChangedElementsInspectorV2.scss";
import { useModelsTreeButtonProps, useModelsTree, TreeWithHeader, ModelsTreeComponent, VisibilityTree, VisibilityTreeRenderer } from "@itwin/tree-widget-react";
import { createStorage, SelectionStorage } from "@itwin/unified-selection";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";

type CustomModelsTreeRendererProps = Parameters<ComponentPropsWithoutRef<typeof VisibilityTree>["treeRenderer"]>[0];
type CreateNodeLabelComponentProps = Required<ComponentPropsWithoutRef<typeof VisibilityTreeRenderer>>["getLabel"];
type PresentationHierarchyNode = Parameters<CreateNodeLabelComponentProps>[0];
type HierarchyNode = PresentationHierarchyNode["nodeData"];
type ColorClasses = "added" | "modified" | "";

//todo should be a way to find these types from the tree widget
type NodeType = "subject" | "model" | "category" | "element" | "class-grouping";

let unifiedSelectionStorage: SelectionStorage | undefined;
const schemaContextCache = new Map<string, SchemaContext>();
const modifiedCategoryIds = new Set<string>();

type ChangedElementsInspectorV2Props = {
  manager: VersionCompareManager;
  current: IModelConnection;
  currentVP: Viewport;
};

type ElementLabelProps = {
  color: ColorClasses;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalLabel: React.ReactElement<any, string | React.JSXElementConstructor<any>> | undefined;
};

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

function ElementLabel(props: ElementLabelProps) {
  return (
    <Flex flexDirection="row">
      <div
        className={`circle ${props.color}`}
      ></div>
      {props.originalLabel}
    </Flex>
  );
}

function ChangedElementsInspectorV2(v2InspectorProps: Readonly<ChangedElementsInspectorV2Props>) {
  const buttonProps = useModelsTreeButtonProps({ imodel: v2InspectorProps.current, viewport: v2InspectorProps.currentVP });
  const { modelsTreeProps, rendererProps } = useModelsTree({ activeView: v2InspectorProps.currentVP });

  function CustomModelsTreeRenderer(props: CustomModelsTreeRendererProps) {
    const getLabel = useCallback<CreateNodeLabelComponentProps>(NodeLabelCreator(props, v2InspectorProps),
      [props.getLabel],
    );
    return <VisibilityTreeRenderer {...props} getLabel={getLabel} />;
  }

  return (
    <TreeWithHeader buttons={[<ModelsTreeComponent.ShowAllButton {...buttonProps} key={"abc123"} />, <ModelsTreeComponent.HideAllButton {...buttonProps} key={"123abc"} />]}>
      <VisibilityTree
        {...modelsTreeProps}
        getSchemaContext={getSchemaContext}
        selectionStorage={getUnifiedSelectionStorage()}
        imodel={v2InspectorProps.current}
        treeRenderer={(props) => <CustomModelsTreeRenderer {...props} {...rendererProps} />}
      />
    </TreeWithHeader>
  );
}

const NodeLabelCreator = (props: Pick<CustomModelsTreeRendererProps, "getLabel">, changedElementsInspectorV2Props: ChangedElementsInspectorV2Props) => {
  function CreateNodeLabelComponent(node: Readonly<PresentationHierarchyNode>) {
    const nodeType = getNodeType(node);
    const [catColor, setCatColor] = useState<ColorClasses>("");
    const modelsCategoryData = ModelsCategoryCache.getModelsCategoryData();
    const ecInstanceId = extractEcInstanceIdFromNode(node, nodeType);
    const originalLabel = props.getLabel(node);

        useEffect(() => {
          const findIfCategoryHasChangedElements = async () => {
            if (ecInstanceId && modifiedCategoryIds.has(ecInstanceId)) {
              setCatColor("modified");
              return;
            }
            for await (const row of changedElementsInspectorV2Props.current.query(
              `SELECT ECInstanceId as id FROM BisCore.GeometricElement3d where Category.id = ${ecInstanceId}`,
            )) {
              if ( ecInstanceId && changedElementsInspectorV2Props.manager.changedElementsManager.filteredChangedElements.has(row[0])) {
                modifiedCategoryIds.add(ecInstanceId);
                setCatColor("modified");
                break;
              }
           }
          };
          if (nodeType === "category") {
            void findIfCategoryHasChangedElements();
          }
        });


    if (ecInstanceId === undefined) {
      return <>{originalLabel}</>;
    }
    if (changedElementsInspectorV2Props.manager.changedElementsManager.allChangeElements.has(ecInstanceId)) {

      const changeElementEntry = changedElementsInspectorV2Props.manager.changedElementsManager.allChangeElements.get(ecInstanceId);
      if (changeElementEntry && (nodeType === "element" || nodeType === "subject")) {
        return ElementLabel({ originalLabel, color: getColorBasedOffDbCode(changeElementEntry.opcode) });
      }
    }
    if (modelsCategoryData?.addedElementsModels.has(ecInstanceId)) {
      return ElementLabel({ originalLabel, color: "modified" });
    }
    if (nodeType === "category") {
      return ElementLabel({ originalLabel, color: catColor });
    }
    return <>{originalLabel}</>;
  }
  return CreateNodeLabelComponent;
};

const extractInstanceNodeKeyFromNode = (node: PresentationHierarchyNode) => {
  const treeNodeItem: HierarchyNode = node.nodeData;
  const key = treeNodeItem ? treeNodeItem.key : undefined;
  if (!key || typeof key === "string" || ("type" in key && key.type !== "instances")) {
    return undefined;
  }
  return key;
};

const extractGroupingNodeKeyFromNode = (node: PresentationHierarchyNode) => {
  const treeNodeItem: HierarchyNode = node.nodeData;
  const key = treeNodeItem ? treeNodeItem.key : undefined;
  if (!key || typeof key === "string" || ("type" in key && key.type !== "class-grouping")) {
    return undefined;
  }
  return key;
};

const extractModelEcInstanceIdFromClassGroupingNode = (node: PresentationHierarchyNode): string | undefined => {
  return node.extendedData?.modelId;
};


const extractEcInstanceIdFromNode = (node: PresentationHierarchyNode, nodeType: NodeType) => {
  if (nodeType !== "class-grouping") {
    return extractInstanceNodeKeyFromNode(node)?.instanceKeys[0].id;
  } else {
    return extractModelEcInstanceIdFromClassGroupingNode(node);
  }
};

const getNodeType = (node: PresentationHierarchyNode): NodeType => {
  if (node.extendedData?.isSubject)
    return "subject";
  if (node.extendedData?.isModel)
    return "model";
  if (node.extendedData?.isCategory)
    return "category";
  if (extractGroupingNodeKeyFromNode(node))
    return "class-grouping";

  return "element";
};

const getColorBasedOffDbCode = (opcode?: DbOpcode): ColorClasses => {
  switch (opcode) {
    case DbOpcode.Insert:
      return "added";
    case DbOpcode.Update:
      return "modified";
    case DbOpcode.Delete:
      return "modified";
    default:
      return "";
  }
};


export default ChangedElementsInspectorV2;

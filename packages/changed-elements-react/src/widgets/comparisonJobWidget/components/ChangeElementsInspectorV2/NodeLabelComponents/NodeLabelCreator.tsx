/* eslint-disable react/prop-types */
import { DbOpcode } from "@itwin/core-bentley";
import { ModelsCategoryCache } from "../../../../../api/ModelsCategoryCache";
import { useEffect, useState } from "react";
import "../styles/NodeLabel.scss";
import { HierarchyNode, NodeType, PresentationHierarchyNode } from "../models/modelsTreeAndNodeTypes";
import { ColorClasses, ElementLabel } from "./ElementLabel";
import ChangedElementsInspectorV2 from "../ChangedElementsInspectorV2";
import { ProgressRadial } from "@itwin/itwinui-react";

const modifiedCategoryIds = new Set<string>();

type NodeLabelCreatorProps = {
  getLabel: (node: PresentationHierarchyNode) => React.ReactElement | undefined;
} & React.ComponentProps<typeof ChangedElementsInspectorV2>;

export const NodeLabelCreator = (props: NodeLabelCreatorProps) => {
  return function CreateNodeLabelComponent(node: Readonly<PresentationHierarchyNode>) {
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
        for await (const row of props.current.query(
          `SELECT ECInstanceId as id FROM BisCore.GeometricElement3d where Category.id = ${ecInstanceId}`,
        )) {
          if (ecInstanceId && props.manager.changedElementsManager.filteredChangedElements.has(row[0])) {
            modifiedCategoryIds.add(ecInstanceId);
          }
          setCatColor("modified");
          break;
        }
      };
      if (nodeType === "category") {
        void findIfCategoryHasChangedElements();
      }
    });
    if (ecInstanceId === undefined) {
      return <>{node.label}</>;
    }
    const changeElementEntry = props.manager.changedElementsManager.allChangeElements.get(ecInstanceId);
    if (changeElementEntry && (nodeType === "element" || nodeType === "subject")) {
      if (nodeType === "element") {
        return ElementLabel({ originalLabel: originalLabel, color: getColorBasedOffDbCode(changeElementEntry.opcode) });
      }
      return ElementLabel({ originalLabel: originalLabel, color: "modified" });
    }
    if (modelsCategoryData?.addedElementsModels.has(ecInstanceId)) {
      return ElementLabel({ originalLabel: originalLabel, color: "modified" });
    }
    if (nodeType === "category") {
      return ElementLabel({ originalLabel: originalLabel, color: catColor });
    }
    if (nodeType === "element") {
      return ElementLabel({ originalLabel: originalLabel, color: "", loading: true });
    }
    return <>{node.label}</>;
  };
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

export default NodeLabelCreator;

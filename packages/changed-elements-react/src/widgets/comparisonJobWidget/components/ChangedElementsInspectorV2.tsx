/* eslint-disable react/prop-types */
import { ModelsTreeComponent, DefaultLabelRenderer, TreeNodeLabelRendererProps, ModelsVisibilityHandler, ModelsTreeNodeType } from "@itwin/tree-widget-react";
import { TreeModelNode } from "@itwin/components-react";
import { Flex } from "@itwin/itwinui-react/esm";
import { VersionCompareManager } from "../../../api/VersionCompareManager";
import { DbOpcode } from "@itwin/core-bentley";
import { isPresentationTreeNodeItem } from "@itwin/presentation-components";
import { NodeKey } from "@itwin/presentation-common";
import { ModelsCategoryCache } from '../../../api/ModelsCategoryCache';
import { useEffect, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import "./styles/ChangedElementsInspectorV2.scss";

type ColorClasses = "added" | "modified" | "";

type ChangedElementsInspectorV2Props = {
  manager: VersionCompareManager;
  current: IModelConnection;
};

const modifiedCategoryIds = new Set<string>();

type ElementLabelProps = TreeNodeLabelRendererProps & { color: ColorClasses; };
function ElementLabel(props: ElementLabelProps) {
  return (
    <Flex flexDirection="row">
      <div
        className={`circle ${props.color}`}
      ></div>
      <DefaultLabelRenderer label={props.node.label} context={props.context} />
    </Flex>
  );
}


function ChangedElementsInspectorV2(changedElementsInspectorV2Props: ChangedElementsInspectorV2Props) {
  useEffect(() => {
    modifiedCategoryIds.clear();
  },[])

  function CustomModelsTreeLabelRenderer(props: TreeNodeLabelRendererProps) {
    const key = extractNodeKeyFromNode(props.node);
    const nodeType = ModelsVisibilityHandler.getNodeType(props.node.item);
    const ecInstanceId = key ? key.instanceKeys[0].id : "";
    const [catColor, setCatColor] = useState<ColorClasses>("");
    const modelsCategoryData = ModelsCategoryCache.getModelsCategoryData();
    useEffect(() => {
      const findIfCategoryHasChangedElements = async () => {
        if (modifiedCategoryIds.has(ecInstanceId)) {
          setCatColor("modified");
          return;
        }
        for await (const row of changedElementsInspectorV2Props.current.query(
          `SELECT ECInstanceId as id FROM BisCore.GeometricElement3d where Category.id = ${ecInstanceId}`,
        )) {
          if (changedElementsInspectorV2Props.manager.changedElementsManager.filteredChangedElements.has(row[0])) {
            modifiedCategoryIds.add(ecInstanceId);
            setCatColor("modified");
            break;
          }
        }
      };
      if (nodeType === ModelsTreeNodeType.Category) {
        void findIfCategoryHasChangedElements();
      }
    });
    if (!key)
      return ElementLabel({ ...props, color: "" });
    if (changedElementsInspectorV2Props.manager.changedElementsManager.allChangeElements.has(ecInstanceId)) {

      const changeElementEntry = changedElementsInspectorV2Props.manager.changedElementsManager.allChangeElements.get(ecInstanceId);;
      if (changeElementEntry && nodeType === ModelsTreeNodeType.Element) {
        return ElementLabel({ ...props, color: getColorBasedOffDbCode(changeElementEntry.opcode) });
      } else if (changeElementEntry) {
        return ElementLabel({ ...props, color: "modified" });
      }
    }
    if (modelsCategoryData?.addedElementsModels.has(ecInstanceId)) {
      return ElementLabel({ ...props, color: "modified" });
    }
    if (nodeType === ModelsTreeNodeType.Category) {
      return ElementLabel({ ...props, color: catColor });
    }
    return ElementLabel({ ...props, color: "" });
  }


  return (
    <ModelsTreeComponent
      headerButtons={[
        (props) => <ModelsTreeComponent.ShowAllButton {...props} />,
        (props) => <ModelsTreeComponent.HideAllButton {...props} />,
      ]}
      nodeLabelRenderer={CustomModelsTreeLabelRenderer}
    />
  );
}

const extractNodeKeyFromNode = (node: TreeModelNode) => {
  const treeNodeItem = node.item;
  if (!isPresentationTreeNodeItem(treeNodeItem))
    return undefined;
  if (NodeKey.isInstancesNodeKey(treeNodeItem.key))
    return treeNodeItem.key;
  return undefined;
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

import { ModelsTreeComponent, ClassGroupingOption, DefaultLabelRenderer, TreeNodeLabelRendererProps, ModelsVisibilityHandler } from "@itwin/tree-widget-react";
import { SelectionMode, TreeModelNode } from "@itwin/components-react";
import { Flex } from "@itwin/itwinui-react/esm";
import { VersionCompareManager } from "../../../api/VersionCompareManager";
import { DbOpcode } from "@itwin/core-bentley";
import { isPresentationTreeNodeItem } from "@itwin/presentation-components";
import { NodeKey } from "@itwin/presentation-common";
import { ModelsCategoryCache } from "../../../api/ModelsCategoryCache";

type ChangedElementsInspectorV2Props = {
  manager: VersionCompareManager;
};

function ChangedElementsInspectorV2(changedElementsInspectorV2Props: ChangedElementsInspectorV2Props) {
  function CustomModelsTreeLabelRenderer(props: TreeNodeLabelRendererProps) {
    if (((props.node.label.value as any).value as string).includes("3190")) {
      console.log("blah");
    }
    const key = extractNodeKeyFromNode(props.node);
    if (!key)
      return (
        <Flex flexDirection="row">
          <DefaultLabelRenderer label={props.node.label} context={props.context} />
        </Flex>
      );
    const modelsCategoryData = ModelsCategoryCache.getModelsCategoryData();
    const subjectIds = changedElementsInspectorV2Props.manager.changedElementsManager.entryCache.subjectIds;
    const ecInstanceId = key.instanceKeys[0].id;
    if (changedElementsInspectorV2Props.manager.changedElementsManager.changedElements.has(ecInstanceId)) {
      const changeElementEntry = changedElementsInspectorV2Props.manager.changedElementsManager.entryCache.changedElementEntries.get(ecInstanceId);
      if (changeElementEntry)
        return (
          <Flex flexDirection="row">
            <div
              style={{
                height: 16,
                width: 16,
                backgroundColor: getColorBasedOffDbCode(changeElementEntry.opcode),
                borderRadius: "50%",
              }}
            ></div>
            <DefaultLabelRenderer label={props.node.label} context={props.context} />
          </Flex>
        );
    } else if (modelsCategoryData?.updatedElementsModels.has(ecInstanceId) || modelsCategoryData?.deletedElementsModels.has(ecInstanceId)) {
      return (
        <Flex flexDirection="row">
          <div
            style={{
              height: 16,
              width: 16,
              backgroundColor: "blue",
              borderRadius: "50%",
            }}
          ></div>
          <DefaultLabelRenderer label={props.node.label} context={props.context} />
        </Flex>
      );
    }
    else if (modelsCategoryData?.addedElementsModels.has(ecInstanceId)) {
      return (
        <Flex flexDirection="row">
          <div
            style={{
              height: 16,
              width: 16,
              backgroundColor: "green",
              borderRadius: "50%",
            }}
          ></div>
          <DefaultLabelRenderer label={props.node.label} context={props.context} />
        </Flex>
      );
    }
    else if (subjectIds.has(ecInstanceId)) {
      return (
        <Flex flexDirection="row">
          <div
            style={{
              height: 16,
              width: 16,
              backgroundColor: "blue",
              borderRadius: "50%",
            }}
          ></div>
          <DefaultLabelRenderer label={props.node.label} context={props.context} />
        </Flex>
      );
    } else if (modelsCategoryData?.updatedCategories.has(ecInstanceId) || modelsCategoryData?.deletedCategories.has(ecInstanceId)) {
      return (
        <Flex flexDirection="row">
          <div
            style={{
              height: 16,
              width: 16,
              backgroundColor: "blue",
              borderRadius: "50%",
            }}
          ></div>
          <DefaultLabelRenderer label={props.node.label} context={props.context} />
        </Flex>
      );
    } else if (modelsCategoryData?.addedCategories.has(ecInstanceId)) {
      return (
        <Flex flexDirection="row">
          <div
            style={{
              height: 16,
              width: 16,
              backgroundColor: "green",
              borderRadius: "50%",
            }}
          ></div>
          <DefaultLabelRenderer label={props.node.label} context={props.context} />
        </Flex>
      );
    }
    return (
      <Flex flexDirection="row">
        <DefaultLabelRenderer label={props.node.label} context={props.context} />
      </Flex>
    );
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

const getColorBasedOffDbCode = (opcode: DbOpcode) => {
  switch (opcode) {
    case DbOpcode.Insert:
      return "green";
    case DbOpcode.Update:
      return "blue";
    case DbOpcode.Delete:
      return "red";
    default:
      return "white";
  }
};


export default ChangedElementsInspectorV2;

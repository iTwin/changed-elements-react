import { ModelsTreeComponent, ClassGroupingOption, DefaultLabelRenderer, TreeNodeLabelRendererProps } from "@itwin/tree-widget-react";
import { SelectionMode, TreeModelNode } from "@itwin/components-react";
import { Flex } from "@itwin/itwinui-react/esm";
import { VersionCompareManager } from "../../../api/VersionCompareManager";
import { DbOpcode } from "@itwin/core-bentley";
import { isPresentationTreeNodeItem } from "@itwin/presentation-components";
import { NodeKey } from "@itwin/presentation-common";

type ChangedElementsInspectorV2Props = {
  manager: VersionCompareManager;
};

function ChangedElementsInspectorV2(changedElementsInspectorV2Props: ChangedElementsInspectorV2Props) {
  function CustomModelsTreeLabelRenderer(props: TreeNodeLabelRendererProps) {
    const key = extractNodeKeyFromNode(props.node);
    if (!key)
       return (
        <Flex flexDirection="row">
          <DefaultLabelRenderer label={props.node.label} context={props.context} />
        </Flex>
      );
  //    const changeElementsClassIds = changedElementsInspectorV2Props.manager.changedElementsManager.entryCache.classIds;
      const ecInstanceId = key.instanceKeys[0].id;
      if (changedElementsInspectorV2Props.manager.changedElementsManager.changedElements.has(ecInstanceId)) {
        return (
          <Flex flexDirection="row">
            <div
              style={{
                height: 16,
                width: 16,
                backgroundColor: getColorBasedOffDbCode(changedElementsInspectorV2Props.manager.changedElementsManager.changedElements.get(ecInstanceId)!.opcode),
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
      selectionMode={SelectionMode.Extended}
      nodeLabelRenderer={CustomModelsTreeLabelRenderer}
      hierarchyConfig={{
        enableElementsClassGrouping: ClassGroupingOption.Yes,
      }}
    />
  );
}

const extractNodeKeyFromNode = (node: TreeModelNode) => {
  const treeNodeItem = node.item;
  if (!isPresentationTreeNodeItem(treeNodeItem))
    return undefined;
  if(NodeKey.isInstancesNodeKey(treeNodeItem.key))
    return treeNodeItem.key;
  return undefined;
}

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

import { ModelsTreeComponent, ClassGroupingOption, DefaultLabelRenderer, TreeNodeLabelRendererProps } from "@itwin/tree-widget-react";
import { SelectionMode } from "@itwin/components-react";
import { Flex } from "@itwin/itwinui-react/esm";
import { VersionCompareManager } from "../../../api/VersionCompareManager";
import { DbOpcode } from "@itwin/core-bentley";

type ChangedElementsInspectorV2Props = {
  manager: VersionCompareManager;
};

function ChangedElementsInspectorV2(changedElementsInspectorV2Props: ChangedElementsInspectorV2Props) {
  function CustomModelsTreeLabelRenderer(props: TreeNodeLabelRendererProps) {
    // any here must be removed in future currently way to get ecInstanceId from props object because it is not declared on the type interface of props.node.item
    // todo talk to model tree team about how to corralte nodes with ecInstanceId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ecInstanceId = (props.node.item as any).key?.instanceKeysSelectQuery.bindings[1].value;
    const nodeType = props.node.item.extendedData?.icon;
    if (nodeType && nodeType === "icon-item" && changedElementsInspectorV2Props.manager.changedElementsManager.changedElements.has(ecInstanceId)) {
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

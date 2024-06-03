import { ModelsTreeComponent, ClassGroupingOption, DefaultLabelRenderer, TreeNodeLabelRendererProps } from "@itwin/tree-widget-react";
import { SelectionMode } from "@itwin/components-react";
import { Flex } from "@itwin/itwinui-react/esm";
import { ReactNode, useState } from "react";

function Hello() {
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


function CustomModelsTreeLabelRenderer(props: TreeNodeLabelRendererProps): ReactNode {
  const [color] = useState(() => {
    const rand = Math.random();
    return rand < 0.33 ? "red" : rand < 0.66 ? "green" : "blue";
  });

  return (
    <Flex flexDirection="row">
      <div
        style={{
          height: 16,
          width: 16,
          backgroundColor: color,
          borderRadius: "50%",
        }}
      ></div>
      <DefaultLabelRenderer label={props.node.label} context={props.context} />
    </Flex>
  );
}

export default Hello;

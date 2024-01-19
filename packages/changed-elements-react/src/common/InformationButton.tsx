import { SvgInfo } from "@itwin/itwinui-icons-react";
import { DropdownMenu, IconButton, MenuDivider, MenuExtraContent, Text } from "@itwin/itwinui-react";

interface Props {
  title: string;
  message: string;
}

function InfoButton(props:Props) {
  return (
    <DropdownMenu
      style={{ width: 500 }}
      placement="bottom-end"
      menuItems={() => [
        <MenuExtraContent key={0}>
          <Text variant="leading">{props.title}</Text>
          <Text>{props.message}</Text>
        </MenuExtraContent>,
        <MenuDivider key={1} />,
      ]}
    >
      <IconButton styleType="borderless" aria-label="Information">
        <SvgInfo />
      </IconButton>
    </DropdownMenu>
  );
}

export default InfoButton;

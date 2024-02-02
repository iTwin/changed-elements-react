/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgInfo } from "@itwin/itwinui-icons-react";
import { DropdownMenu, IconButton, MenuDivider, MenuExtraContent, Text } from "@itwin/itwinui-react";

interface Props {
  // title of information drop down
  title: string;
  // contents of information drop down
  message: string;
}

/**
 * Information button that provides information drop down on click.
 * Click off drop down to close
 */
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

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgInfo } from "@itwin/itwinui-icons-react";
import { DropdownMenu, IconButton, MenuExtraContent } from "@itwin/itwinui-react";
import type { ReactNode } from "react";

interface Props {
  "data-testid"?: string;
  children: ReactNode;
}

/**
 * Information button that provides information drop down on click.
 * Click off drop down to close
 */
function InfoButton(props: Props) {
  return (
    <DropdownMenu
      style={{ width: 500 }}
      placement="bottom-end"
      menuItems={() => [
        <MenuExtraContent key={0}>
          {props.children}
        </MenuExtraContent>,
      ]}
    >
      <IconButton
        data-testid={props["data-testid"]}
        styleType="borderless"
        aria-label="Information"
      >
        <SvgInfo />
      </IconButton>
    </DropdownMenu>
  );
}

export default InfoButton;

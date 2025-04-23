/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgDocument, SvgWindowPopout } from "@itwin/itwinui-icons-react";
import { Flex, Text } from "@itwin/itwinui-react";
import { IconEx } from "../NamedVersionSelector/IconEx.js";
import "./Documentation.scss";

interface DocumentationProps {
  href: string;
}

/**
 * A component that renders a documentation button with an icon and text.
 * Clicking the button opens the provided documentation link in a new tab.
 *
 * @param {Readonly<DocumentationProps>} props - The props for the component.
 * @returns {JSX.Element} The rendered Documentation component.
 */
export function Documentation(props: Readonly<DocumentationProps>) {
  const handleClick = () => { };
  return (<Flex className="documentation-button-container" as="a" href={props.href} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
    <div className="documentation-button-content">
      <IconEx size="m" fill="informational">
        {<SvgDocument />}
      </IconEx>
      <Text className="documentation-button-text">Documentation</Text>
    </div>
    <Flex.Spacer />
    <IconEx size="m" fill="informational">
      {<SvgWindowPopout />}
    </IconEx>
  </Flex>);
}

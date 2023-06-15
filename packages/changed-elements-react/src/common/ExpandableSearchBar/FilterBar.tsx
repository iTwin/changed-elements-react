/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgSearch } from "@itwin/itwinui-icons-react";
import { Anchor, Flex, Tag, TagContainer, Text } from "@itwin/itwinui-react";
import { type ReactElement, type ReactNode } from "react";

export interface FilterBarProps {
  /** Text displayed in the filter bar. */
  text: ReactNode;

  /** On click handler when the text is clicked. */
  onTextClick?: () => void;

  /** On click handler when the clear button is clicked. */
  onCloseClick?: () => void;
}

export function FilterBar(props: FilterBarProps): ReactElement {
  return (
    <TagContainer>
      <Tag onRemove={() => props.onCloseClick?.()}>
        <Flex gap="2xs">
          <SvgSearch />
          {
            props.onTextClick
              ? <Anchor as="button" onClick={() => props.onTextClick?.()}>{props.text}</Anchor>
              : <Text>{props.text}</Text>
          }
        </Flex>
      </Tag>
    </TagContainer>
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { CSSProperties, ReactElement, ReactNode } from "react";
import { Leading, ProgressRadial } from "@itwin/itwinui-react";
import { VerticalStack } from "./VerticalStack";

export interface LoadingIndicatorProps {
  style?: CSSProperties | undefined;
  id?: string | undefined;
  children: ReactNode;
}

/** Displays a spinning loading animation with a description. */
export function LoadingIndicator(props: LoadingIndicatorProps): ReactElement {
  return (
    <VerticalStack id={props.id} style={props.style}>
      <ProgressRadial size="large" indeterminate={true} />
      <Leading>{props.children}</Leading>
    </VerticalStack>
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ReactElement, type HTMLProps } from "react";

import "./CenteredDiv.css";

/**
 * Div component that will center its children
 *
 * @example
 * <CenteredDiv>
 *   <LoadingSpinner />
 * </CenteredDiv
 *
 * @example
 * (inline style only for demonstration, please use a className/selector if needed)
 * <CenteredDiv style={{gap: "10px"}}> // customize the space between centered items
 *   <LoadingSpinner />
 *   <span>Loading...</span>
 * </CenteredDiv
 */

export function CenteredDiv(props: HTMLProps<HTMLDivElement>): ReactElement {
  return (
    <div {...props} className={`itwin-common-centered-div ${props.className ?? ""}`}>
      {props.children}
    </div>
  );
}

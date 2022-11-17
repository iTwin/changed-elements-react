/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./VerticalStack.css";
import { CSSProperties, ReactElement, ReactNode } from "react";

export interface VerticalStackProps {
  id?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  children: ReactNode;
}

export function VerticalStack(props: VerticalStackProps): ReactElement {
  return (
    <div id={props.id} className={getClassName("vertical-stack", props.className)} style={props.style}>
      {props.children}
    </div>
  );
}

function getClassName(mainClassName: string, auxiliaryClassName: string | undefined): string {
  return auxiliaryClassName ? `${mainClassName} ${auxiliaryClassName}` : mainClassName;
}

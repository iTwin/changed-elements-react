/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { type CommonProps, type IconSpec, Icon } from "@itwin/core-react";
import { type ReactElement } from "react";

import "./EmptyStateComponent.scss";

interface Props extends CommonProps {
  icon?: IconSpec;
  title?: string;
  description?: string;
}

export function EmptyStateComponent(props: Props): ReactElement {
  return (
    <div className={`empty-component-container ${props.className ?? ""}`} style={props.style}>
      {props.icon && <Icon className={`icon ${props.icon ?? ""}`} iconSpec={props.icon}/>}
      {props.title && <span className="error-title">{props.title}</span>}
      {props.description && <span className="error-description">{props.description}</span>}
    </div>
  );
}

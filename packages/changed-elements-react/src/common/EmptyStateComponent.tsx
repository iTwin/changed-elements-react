/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Icon, type CommonProps, type IconSpec } from "@itwin/core-react";
import { Text } from "@itwin/itwinui-react";
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
      {props.description && <Text isMuted>{props.description}</Text>}
    </div>
  );
}

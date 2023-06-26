/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { forwardRef, type ReactElement } from "react";
import { WidgetBody } from "./WidgetBody.js";
import { WidgetHeader } from "./WidgetHeader.js";
import { WidgetToolBar } from "./WidgetToolBar.js";

import "./Widget.css";

export type WidgetProps = {
  /** Widget content. */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Widget component.
 * @example
 * <Widget>*
 *   <Widget.Header>
 *     My Widget title
 *   </Widget.Header>
 *   <Widget.Body>
 *     Here is my Widget content
 *   </Widget.Body>
 * </Widget>
 *
 * <Widget>
 *   <Widget.Header>
 *     <Widget.Header.Label>
 *        My Widget title
 *     </Widget.Header.Label>
 *     <Widget.Header.Actions>
 *       <IconButton size="small" styleType="borderless">
 *         <SvgClose />
 *       </IconButton>
 *     </Widget.Header.Actions>
 *   </Widget.Header>
 *   <Widget.Toolbar>
 *     <IconButton size="small" styleType="borderless">
 *      <SvgPlaceholder />
 *     </IconButton>
 *   </Widget.Toolbar>
 *   <Widget.Body>
 *     Here is my Widget content
 *   </Widget.Body>
 * </Widget>
 */

export const Widget = Object.assign(
  forwardRef<HTMLDivElement, WidgetProps>(function Widget(props, ref): ReactElement {
    const { children, className, style, ...rest } = props;
    return (
      <div ref={ref} className={`itwin-widget ${className ?? ""}`} style={{ ...style }} {...rest}>
        {children}
      </div>
    );
  }),
  {
    Header: WidgetHeader,
    ToolBar: WidgetToolBar,
    Body: WidgetBody,
  },
);

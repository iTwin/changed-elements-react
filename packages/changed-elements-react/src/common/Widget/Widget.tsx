/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { forwardRef, type ReactElement } from "react";
import { WidgetContent } from "./WidgetContent";
import { WidgetTitleBar } from "./WidgetTitleBar";
import { WidgetToolBar } from "./WidgetToolBar";

import "./Widget.css";

export type WidgetProps = {
  /** Widget content. */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Widget component.
 * @example
 * <Widget>*
 *   <Widget.TitleBar>
 *     My Widget title
 *   </Widget.TitleBar>
 *   <Widget.Content>
 *     Here is my Widget content
 *   </Widget.Content>
 * </Widget>
 *
 * <Widget>
 *   <Widget.TitleBar>
 *     <Widget.TitleBar.Title>
 *        My Widget title
 *     </Widget.TitleBar.Title>
 *     <Widget.TitleBar.Content>
 *       <IconButton
 *         size='small'
 *         styleType='borderless'
 *       >
 *         <SvgClose />
 *       </IconButton>
 *     </Widget.TitleBar.Content>
 *   </Widget.TitleBar>
 *   <Widget.Toolbar>
 *     <IconButton
 *       size='small'
 *       styleType='borderless'
 *     >
 *      <SvgPlaceholder />
 *     </IconButton>
 *   </Widget.Toolbar>
 *   <Widget.Content>
 *     Here is my Widget content
 *   </Widget.Content>
 * </Widget>
 */

export const Widget = Object.assign(
  forwardRef<HTMLDivElement, WidgetProps>(function Widget(props, ref): ReactElement {
    const { children, className, style, ...rest } = props;
    return (
      <div
        ref={ref}
        className={`itwin-common-widget ${className ?? ""}`}
        style={{ ...style }}
        {...rest}
      >
        {children}
      </div>
    );
  }),
  {
    TitleBar: WidgetTitleBar,
    ToolBar: WidgetToolBar,
    Content: WidgetContent,
  },
);

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { forwardRef, ReactElement } from "react";

import "./Widget.css";

export type WidgetToolBarProps = React.ComponentPropsWithRef<"div">;

/**
 * Widget toolbar bar. Recommended to be used as a child of `Widget`.
 * @example
 * <Widget.ToolBar>
 *   <div ... /> // toolbar content
 * </Widget.ToolBar>
 */
export const WidgetToolBar = forwardRef<HTMLDivElement, React.PropsWithChildren<WidgetToolBarProps>>(
  function WidgetToolBar(props, ref): ReactElement {
    const { children, className, ...rest } = props;
    return (
      <div ref={ref} className={`itwin-widget-toolbar ${className ?? ""}`} {...rest}>
        {children}
      </div>
    );
  },
);

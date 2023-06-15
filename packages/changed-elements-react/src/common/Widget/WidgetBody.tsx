/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { forwardRef, type ReactElement } from "react";

import "./Widget.css";

export type WidgetBodyProps = {
  /** Main content in the Widget. */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Container for content in `Widget`. Recommended to be used as a child of `Widget`.
 * @example
 * <Widget.Body>
 *   My Widget content
 * </Widget.Body>
 */
export const WidgetBody = forwardRef<HTMLDivElement, WidgetBodyProps>(
  function WidgetBody(props, ref): ReactElement {
    const { children, className, ...rest } = props;
    return (
      <div ref={ref} className={`itwin-widget-body ${className ?? ""}`} {...rest}>
        {children}
      </div>
    );
  },
);

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { forwardRef, type ReactElement } from "react";

import "./Widget.css";

export type WidgetContentProps = {
  /** Main content in the Widget. */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Container for content in `Widget`. Recommended to be used as a child of `Widget`.
 * @example
 * <Widget.Content>
 *   My Widget content
 * </Widget.Content>
 */
export const WidgetContent = forwardRef<HTMLDivElement, WidgetContentProps>(
  function WidgetContent(props, ref): ReactElement {
    const { children, className, ...rest } = props;
    return (
      <div
        ref={ref}
        className={`itwin-common-widget-content ${className ?? ""}`}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

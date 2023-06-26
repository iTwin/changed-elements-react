/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { forwardRef, ReactElement } from "react";

import "./Widget.css";

export type WidgetHeaderActionsProps = {
  /** Content in the `WidgetHeaderActions`. */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Custom header action buttons shown on the right. Recommended to be used as a child of `WidgetHeader`.
 *
 * @example
 * <Widget.Header.Actions>
 *   <SvgSettings />
 * </Widget.Header.Actions>
 */
export const WidgetHeaderActions = forwardRef<HTMLDivElement, WidgetHeaderActionsProps>(
  function WidgetHeaderActions(props, ref): ReactElement {
    const { children, className, ...rest } = props;
    return (
      <div ref={ref} className={`itwin-widget-header-actions ${className ?? ""}`} {...rest}>
        {children}
      </div>
    );
  },
);

export type WidgetHeaderLabelProps = {
  /**
   * Widget title content.
   */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Widget header label. Recommended to be used as a child of `Widget.Header`.
 *
 * @example
 * <Widget.Header.Label>
 *   My widget title
 * </Widget.Header.Label>
 */
export const WidgetHeaderLabel = forwardRef<HTMLDivElement, WidgetHeaderLabelProps>(
  function WidgetHeaderLabel(props, ref): ReactElement {
    const { children, className, ...rest } = props;
    return (
      <div ref={ref} className={`itwin-widget-header-label ${className ?? ""}`} {...rest}>
        {children}
      </div>
    );
  },
);

export type WidgetHeaderProps = {
  /** Widget title bar content. If passed, then `title` prop is ignored. */
  children?: React.ReactNode;

  /** Widget title. */
  titleText?: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Widget title bar. Recommended to be used as a child of `Widget`.
 * @example
 * <Widget.Header title="My widget title" />
 * @example
 * <Widget.Header>
 *   <Widget.Header.Label>
 *      My widget title
 *   </Widget.Header.Label>
 *   <Widget.Header.Actions>
 *     <IconButton
 *       size="small"
 *       styleType="borderless"
 *       onClick={onClose}
 *       aria-label="Close"
 *     >
 *       <SvgClose />
 *     </IconButton>
 *   </Widget.Header.Actions>
 * </Widget.Header>
 */
export const WidgetHeader = Object.assign(
  forwardRef<HTMLDivElement, WidgetHeaderProps>(
    function WidgetHeader(props, ref): ReactElement {
      const { children, titleText, className, ...rest } = props;
      return (
        <div ref={ref} className={`itwin-widget-header ${className ?? ""}`} {...rest}>
          {children ? children : <WidgetHeaderLabel>{titleText}</WidgetHeaderLabel>}
        </div>
      );
    },
  ),
  {
    Label: WidgetHeaderLabel,
    Actions: WidgetHeaderActions,
  },
);

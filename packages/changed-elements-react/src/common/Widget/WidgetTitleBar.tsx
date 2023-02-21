/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { forwardRef, ReactElement } from "react";

import "./Widget.css";

export type WidgetTitleBarContentProps = {
  /** Content in the `WidgetTitleBar`. */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Container for content in `WidgetTitleBar`. Recommended to be used as a child of `WidgetTitleBar`.
 * @example
 * <Widget.TitleBar.Content>
 *   My Widget content
 * </Widget.TitleBar.Content>
 */
export const WidgetTitleBarContent = forwardRef<HTMLDivElement, WidgetTitleBarContentProps>(
  function WidgetTitleBarContent(props, ref): ReactElement {
    const { children, className, ...rest } = props;
    return (
      <div
        ref={ref}
        className={`itwin-common-widget-title-bar-content ${className ?? ""}`}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

export type WidgetTitleBarTitleProps = {
  /**
   * Widget title content.
   */
  children: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Widget title bar. Recommended to be used as a child of `Widget`.
 * @example
 * <Widget.TitleBar>My widget title</Widget.TitleBar>
 */
export const WidgetTitleBarTitle = forwardRef<HTMLDivElement, WidgetTitleBarTitleProps>(
  function (props, ref): ReactElement {
    const { children, className, ...rest } = props;
    return (
      <div
        className={`itwin-common-widget-title ${className ?? ""}`}
        ref={ref}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

export type WidgetTitleBarProps = {
  /** Widget title bar content. If passed, then `title` prop is ignored. */
  children?: React.ReactNode;
  /** Widget title. */
  titleText?: React.ReactNode;
} & React.ComponentPropsWithRef<"div">;

/**
 * Widget title bar. Recommended to be used as a child of `Widget`.
 * @example
 * <Widget.TitleBar title='My widget title' />
 * @example
 * <Widget.TitleBar>
 *   <Widget.TitleBar.Title>
 *      My widget title
 *   </Widget.TitleBar.Title>
 *   <Widget.TitleBar.Content>
 *     <IconButton
 *       size='small'
 *       styleType='borderless'
 *       onClick={onClose}
 *       aria-label='Close'
 *     >
 *       <SvgClose />
 *     </IconButton>
 *   </Widget.TitleBar.Content>
 * </Widget.TitleBar>
 */
export const WidgetTitleBar = Object.assign(
  forwardRef<HTMLDivElement, WidgetTitleBarProps>(
    function WidgetTitleBar(props, ref): ReactElement {
      const { children, titleText, className, ...rest } = props;
      return (
        <div
          ref={ref}
          className={`itwin-common-widget-title-bar ${className ?? ""}`}
          {...rest}
        >
          {children ? children : <WidgetTitleBarTitle>{titleText}</WidgetTitleBarTitle>}
        </div>
      );
    },
  ),
  {
    Title: WidgetTitleBarTitle,
    Content: WidgetTitleBarContent,
  },
);

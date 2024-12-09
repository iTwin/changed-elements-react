/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { type ComponentProps, type CSSProperties } from "react";
import { Text } from "@itwin/itwinui-react-3";
import clsx from "clsx";

import "./TextEx.css";

interface TextExProps extends ComponentProps<typeof Text> {
  weight?: "light" | "normal" | "semibold" | "bold" | undefined;
  oblique?: boolean | undefined;
  overflow?: "wrap" | "nowrap" | "ellipsis" | undefined;
  color?: string | undefined;
  children?: string | undefined;
}

/** iui3 <Text /> component with extended capabilities. */
export function TextEx(props: TextExProps): ReturnType<typeof Text> {
  const {
    className,
    style,
    weight,
    oblique,
    overflow,
    color,
    children,
    ...rest
  } = props;
  return (
    <Text
      {...rest}
      as={oblique ? "i" : "div"}
      className={clsx("_cer_v1_text", className)}
      data-weight={weight}
      data-overflow={overflow}
      style={{ color, ...style } as CSSProperties}
      title={overflow === "ellipsis" ? children : undefined}
    >
      {children}
    </Text>
  );
}

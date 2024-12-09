/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Icon } from "@itwin/itwinui-react-3";
import clsx from "clsx";
import type { ComponentProps, ReactElement } from "react";

import "./IconEx.css";

interface IconExProps extends ComponentProps<typeof Icon> {
  size?: "auto" | "s" | "m" | "l" | "xl" | undefined;
  fill?: "default" | "currentColor" | "positive" | "informational" | "negative" | "warning" | undefined;
}

export function IconEx(props: IconExProps): ReactElement {
  const { className, ...rest } = props;
  return <Icon className={clsx("_cer_v1_icon", className)} {...rest} />;
}

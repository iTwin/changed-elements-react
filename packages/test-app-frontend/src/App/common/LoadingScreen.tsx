/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { PageLayout } from "@itwin/itwinui-layouts-react";
import type { PropsWithChildren, ReactElement } from "react";

import { LoadingIndicator } from "./LoadingIndicator.js";

// eslint-disable-next-line @typescript-eslint/ban-types
export function LoadingScreen(props: PropsWithChildren<{}>): ReactElement {
  return (
    <PageLayout.Content>
      <LoadingIndicator style={{ height: "100%" }}>{props.children}</LoadingIndicator>
    </PageLayout.Content>
  );
}

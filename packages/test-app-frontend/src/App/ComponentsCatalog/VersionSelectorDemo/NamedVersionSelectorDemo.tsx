/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { NamedVersionSelector } from "@itwin/changed-elements-react";
import { ReactElement } from "react";
import { currentNamedVersion, namedVersionList } from "./common";

export function NamedVersionSelectorDemo(): ReactElement {
  return (
    <div style={{ padding: "var(--iui-size-m)" }}>
      <NamedVersionSelector namedVersionList={namedVersionList} currentNamedVersion={currentNamedVersion} />
    </div>
  );
}

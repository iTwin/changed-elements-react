/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { useState } from "react";
import { IModelApp } from "@itwin/core-frontend";
import "./styles/ComparisonJobWidget.scss";


export interface ManageNamedVersionsProps {
  manageNamedVersionHref?: string;
  onclickManageNamedVersion?: () => Promise<void>;
  manageNamedVersionLabel?: string;
}

/**
 * Provides a href that will, on a click, navigate to the provided link or invoke the provided onClick method.
 *
 * Please note if href and both on click are provided; the component will not use on click but will use href instead.
 *
 * ManageNamedVersionLabel will default to `Manage named versions` if not provided.
 */
export function ManageNamedVersions(props: ManageNamedVersionsProps) {
  const [hasBeenClicked, setHasBeenClicked] = useState<boolean>();
  const onClick = () => {
    if (!props.manageNamedVersionHref && props.onclickManageNamedVersion) {
      void props.onclickManageNamedVersion();
    }
    setHasBeenClicked(true);
  };
  return (<div className="comparison-job-selector-manage-link">
    <a
      href={props.manageNamedVersionHref}
      target="_blank"
      rel="noopener noreferrer"
      className={hasBeenClicked ? "message message-visited" : "message message-not-visited"}
      onClick={onClick}>
      {props.manageNamedVersionLabel ? props.manageNamedVersionLabel : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.manageNamedVersions")}
    </a>
  </div>);
}

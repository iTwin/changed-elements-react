/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./styles/ComparisonJobWidget.scss";


export interface ManageNamedVersionsProps {
  children: React.ReactNode;
}

/**
 * Provides a div that should be populated by child component.
 */
export function ManageNamedVersions(props: ManageNamedVersionsProps) {
  return (
    <div className="comparison-job-selector-manage-link">
      {props.children}
    </div>);
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { PropertyRecord, type PrimitiveValue } from "@itwin/appui-abstract";
import { DbOpcode } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { SvgChevronRight, SvgCompare, SvgFolder, SvgItem } from "@itwin/itwinui-icons-react";
import { Checkbox, IconButton } from "@itwin/itwinui-react";
import React from "react";

import type { ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import { getTypeOfChangeTooltip } from "../api/ChangesTooltipProvider.js";
import { VersionCompare } from "../api/VersionCompare.js";

import "./ChangedElementsInspector.scss";

export interface ElementListNodeProps {
  id: string;
  selected: boolean;
  label: string | PropertyRecord;
  indirect?: boolean;
  visible: boolean;
  type?: number;
  wantTypeTooltip?: boolean;
  opcode?: DbOpcode;
  hasChildren: boolean;
  isModel: boolean;
  wantChangeSquare: boolean;
  loadingChildren: boolean;
  element?: ChangedElementEntry;
  toggleVisibility: () => void;
  onInspect: () => void;
  onClick?: () => void;
  onPropertyCompare: () => void;
}

/** Renders the element node in the changed elements inspector */
export class ElementNodeComponent extends React.Component<ElementListNodeProps> {
  /** Get change type tooltip based on opcode */
  private _getChangeType = (opcode: DbOpcode | undefined) => {
    if (opcode === undefined) {
      return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.unchanged");
    }
    switch (opcode) {
      case DbOpcode.Insert:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.added");
      case DbOpcode.Delete:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.removed");
      case DbOpcode.Update:
        return IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.modified");
    }
  };

  /** Class for the change square */
  private _getChangeSquareClass = () => {
    if (
      !this.props.isModel &&
      (this.props.indirect ||
        (VersionCompare.manager?.wantTypeOfChange &&
          this.props.opcode === DbOpcode.Update &&
          this.props.type === 0))
    ) {
      return "change-square-indirect";
    }

    // Shouldn't happen
    if (this.props.opcode === undefined) {
      return "";
    }

    switch (this.props.opcode) {
      case DbOpcode.Insert:
        return "change-square-added";
      case DbOpcode.Delete:
        return "change-square-deleted";
      case DbOpcode.Update:
        return "change-square-modified";
    }
  };

  private _getChangeClassName = (opcode: DbOpcode | undefined) => {
    if (opcode === undefined) {
      return "unchanged";
    }
    switch (opcode) {
      case DbOpcode.Insert:
        return "added";
      case DbOpcode.Delete:
        return "deleted";
      case DbOpcode.Update:
        return "modified";
    }
  };

  /** Tooltip for change square */
  private _getChangeSquareTooltip = () => {
    if (this.props.isModel) {
      return IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.modelHasChanges");
    }

    if (
      this.props.indirect ||
      (VersionCompare.manager?.wantTypeOfChange &&
        this.props.opcode === DbOpcode.Update &&
        this.props.type === 0)
    ) {
      return IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.modifiedIndirectly");
    }

    // Shouldn't happen
    if (this.props.opcode === undefined) {
      return "";
    }

    switch (this.props.opcode) {
      case DbOpcode.Insert:
        return IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.added");
      case DbOpcode.Delete:
        return IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.deleted");
      case DbOpcode.Update:
        return IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.modified");
    }
  };

  private handleVisibilityChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    // Toggle visibility if checkbox state and visibility now disagree
    if (event.target.checked !== this.props.visible) {
      this.props.toggleVisibility();
    }
  }

  public override render() {
    const nodeClasses = `element-node ${this.props.selected ? "selected" : ""}`;
    const classes = `element-label ${!this.props.wantChangeSquare ? this._getChangeClassName(this.props.opcode) : ""}`;
    const label =
      typeof this.props.label === "string"
        ? this.props.label
        : (this.props.label.value as PrimitiveValue).displayValue;
    const indirectly = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.indirectly");
    const tooltip =
      label +
      " (" +
      this._getChangeType(this.props.opcode) +
      (this.props.indirect ? " " + indirectly : "") +
      ")" +
      (this.props.wantTypeTooltip && this.props.opcode === DbOpcode.Update && !this.props.isModel
        ? "\n" + getTypeOfChangeTooltip(this.props.element, false)
        : "");
    return (
      <div
        key={this.props.id}
        className={nodeClasses}
        onClick={this.props.onClick}
      >
        <div className="vc-element-node-tools">
          <div className="vc-checkbox-container">
            <Checkbox
              variant="eyeball"
              checked={this.props.visible}
              onChange={this.handleVisibilityChange}
            />
          </div>
          {this.props.wantChangeSquare && (
            <div
              className={this._getChangeSquareClass()}
              title={this._getChangeSquareTooltip()}
            ></div>
          )}
          {this.props.isModel ? <SvgFolder className="vc-node-icon" /> : <SvgItem className="vc-node-icon" />}
        </div>
        <div className={classes} title={tooltip}>
          {label}
        </div>
        <IconButton
          size="small"
          styleType="borderless"
          className={`vc-element-inspect-button ${(
            this.props.selected &&
            !this.props.isModel &&
            this.props.opcode !== undefined &&
            VersionCompare.manager?.wantAppUi &&
            this.props.opcode === DbOpcode.Update) ? "show" : ""}`}
          onClick={this.props.onPropertyCompare}
          title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.inspectProperties")}
          data-testid="comparison-legend-widget-element-inspectBtn"
        >
          <SvgCompare />
        </IconButton>
        <IconButton
          size="small"
          styleType="borderless"
          className={`element-expander ${!this.props.hasChildren ? "hidden" : ""}`}
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            this.props.onInspect?.();
          }}
          title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.inspectChanges")}
        >
          <SvgChevronRight />
        </IconButton>
      </div>
    );
  }
}

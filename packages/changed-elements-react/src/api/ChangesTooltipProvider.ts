/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { TypeOfChange } from "@itwin/core-common";
import { HitDetail, IModelApp, type ToolTipProvider } from "@itwin/core-frontend";

import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";
import { VersionCompare } from "./VersionCompare.js";
import { VersionCompareManager } from "./VersionCompareManager.js";

/**
 * Appends the proper localized string that matches the given type of change
 * @param message Message to append the type to
 * @param type Type of change of the element
 * @param toc TypeOfChange enum value to be checked against
 * @param localeStr Locale string for the type of change
 * @returns Message appended with the type of change localized string
 */
const appendChangeType = (
  message: string,
  type: number,
  toc: TypeOfChange,
  localeStr: string,
) => {
  if ((type & toc) !== 0) {
    return (
      message +
      IModelApp.localization.getLocalizedString(
        "VersionCompare:typeOfChange." + localeStr,
      ) +
      ", "
    );
  }
  return message;
};

/**
 * Appends the type of changes to a string
 * @param message message to append to
 * @param typeOfChange type of change being added in message
 * @returns
 */
const appendChangeTypes = (message: string, typeOfChange: number) => {
  message = appendChangeType(
    message,
    typeOfChange,
    TypeOfChange.Geometry,
    "geometry",
  );
  message = appendChangeType(
    message,
    typeOfChange,
    TypeOfChange.Placement,
    "placement",
  );
  message = appendChangeType(
    message,
    typeOfChange,
    TypeOfChange.Property | TypeOfChange.Indirect,
    "property",
  );
  message = appendChangeType(
    message,
    typeOfChange,
    TypeOfChange.Hidden,
    "hiddenProperty",
  );
  return message.substr(0, message.length - 2);
};

/**
 * Appends a message containing the change types of the children
 * @param message
 * @param element
 */
const appendChildrenChangeTypes = (
  message: string,
  element?: ChangedElementEntry,
) => {
  // Check validity of entry and if it has children
  if (
    !element ||
    !element.hasChangedChildren ||
    element.children === undefined
  ) {
    return message;
  }

  // Get child entries
  const childEntries =
    VersionCompare.manager?.changedElementsManager.entryCache.getCached(element.children);
  if (childEntries === undefined || childEntries.length === 0) {
    return message;
  }

  // Append children changes in a new line
  message +=
    "\n" +
    IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.childrenChanges") +
    ": ";

  let hasAddedChildren = false;
  let hasRemovedChildren = false;
  // Do a boolean OR operation on the bitflags to get all the change types on children
  let typeOfChange = 0;
  for (const entry of childEntries) {
    typeOfChange |= entry.type;
    hasAddedChildren = hasAddedChildren || entry.opcode === DbOpcode.Insert;
    hasRemovedChildren = hasRemovedChildren || entry.opcode === DbOpcode.Delete;
  }

  // If no children change, return proper message
  if (!hasAddedChildren && !hasRemovedChildren && typeOfChange === 0) {
    return (
      message +
      IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.noChanges")
    );
  }

  // Add messages for added or removed children
  if (hasAddedChildren) {
    message +=
      IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.childrenAdded") + ", ";
  }
  if (hasRemovedChildren) {
    message +=
      IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.childrenRemoved") + ", ";
  }
  // If no type of change to append, return the message that we have so far and clean-up comma
  if (typeOfChange === 0) {
    return message.substr(0, message.length - 2);
  }

  // Append types of children changes
  return appendChangeTypes(message, typeOfChange);
};

/** Returns a tooltip containing what changed in the element */
export const getTypeOfChangeTooltipFromOperations = (
  opcode?: DbOpcode,
  typeOfChange?: number,
  _hasChangedChildren?: boolean,
  isHtml?: boolean,
) => {
  // Append title
  let message = isHtml
    ? "<b>" +
    IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.title") +
    "</b>"
    : IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.title");

  // If we have no change, return so
  if (typeOfChange === undefined && opcode === undefined) {
    return (
      message +
      IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.noChanges")
    );
  }

  // Append type of operation
  if (opcode === DbOpcode.Insert) {
    return (
      message +
      IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.elementAdded")
    );
  }
  if (opcode === DbOpcode.Delete) {
    return (
      message +
      IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.elementDeleted")
    );
  }

  // Check if we have no type of change data
  if (typeOfChange === undefined || typeOfChange === 0) {
    return (
      message +
      IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.noChanges")
    );
  }

  // Append type of change
  message = appendChangeTypes(message, typeOfChange);
  return message;
};

/**
 * Returns a tooltip containing what changed in the element
 * @param element Element to show change for
 * @param isHtml Whether to format the title in HTML or just return a string
 * @returns Tooltip message
 */
export const getTypeOfChangeTooltip = (element: ChangedElementEntry | undefined, isHtml?: boolean): string => {
  // Get changes for the element
  const message = getTypeOfChangeTooltipFromOperations(
    element?.opcode,
    element?.type,
    element?.hasChangedChildren,
    isHtml,
  );
  // Append changes that occurred on element's children
  return appendChildrenChangeTypes(message, element);
};

/**
 * Gets the type of change tooltip in HTML format
 * @param element
 * @returns
 */
export const getTypeOfChangeTooltipHtmlFormat = (element: ChangedElementEntry | undefined): string => {
  return getTypeOfChangeTooltip(element, true);
};

/** Provides change type information when doing version compare */
export class ChangesTooltipProvider implements ToolTipProvider {
  constructor(private _manager: VersionCompareManager) { }

  public async augmentToolTip(
    hit: HitDetail,
    tooltip: Promise<string | HTMLElement>,
  ): Promise<string | HTMLElement> {
    if (!hit.isElementHit || !this._manager.isComparing) {
      return tooltip;
    }

    const entries = this._manager.changedElementsManager.entryCache.getCached([
      hit.sourceId,
    ]);
    if (entries.length === 0) {
      return tooltip;
    }

    const entry = entries[0];
    const tooltipString = await tooltip;
    if (typeof tooltipString === "string") {
      return tooltipString + "\n" + getTypeOfChangeTooltip(entry, false);
    } else {
      const div = document.createElement("div");
      div.innerHTML = getTypeOfChangeTooltipHtmlFormat(entry);
      (tooltipString as HTMLElement).append(div);
      return tooltipString;
    }
  }
}

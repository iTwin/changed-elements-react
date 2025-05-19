/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { TypeOfChange } from "@itwin/core-common";

const geometricProperties: string[] = ["Category", "InSpatialIndex", "GeometryStream"];
const placementProperties: string[] = ["Origin", "Yaw", "Pitch", "Roll", "BBoxLow", "BBoxHigh"];

// Properties that should always be hidden, but may not appear in query for hidden properties
const alwaysHiddenProperties: string[] = [];

// Don't consider these as changed properties for the change summary or type of change
const ignoredProperties: string[] = [
  "$meta",
  "ECClassId",
  "ECInstanceId",
  "LastMod",
  "Element",
  "Model",
  "Origin",
  ...geometricProperties,
  ...placementProperties,
];

// Properties which should show up in the change summary, but that we don't want to show every sub-level change that was made.
// E.g., If "MyValue" should appear in the final output, but "MyValue.X", "MyValue.Y", etc. should not.
const propertiesWithIgnoredSubproperties: string[] = ["Geometry"];

export const isContainedInArray = (value: string, array: string[]) => {
  return array.find((arrValue) => arrValue === value) !== undefined;
};

const isGeometricProperty = (prop: string): boolean => {
  return isContainedInArray(prop, geometricProperties);
};

const isPlacementProperty = (prop: string): boolean => {
  return isContainedInArray(prop, placementProperties);
};

export const isAlwaysHiddenProperty = (prop: string): boolean => {
  return isContainedInArray(prop, alwaysHiddenProperties);
};

const isParentProperty = (prop: string): boolean => {
  return prop === "Parent";
};

const isModelProperty = (prop: string): boolean => {
  return prop === "Model";
};

export const isIgnoredProperty = (prop: string) => {
  return isContainedInArray(prop, ignoredProperties);
};

export const isPropertyWithIgnoredSubproperties = (prop: string) => {
  return isContainedInArray(prop, propertiesWithIgnoredSubproperties);
};

/**
 * Uses changed properties found to determine type of change.
 *
 * Relies on the PropertyPathTraverser to determine if a property is hidden.
 *
 * TODO: Consider if method should be moved to PropertyPathTraverser or otherwise refactored to exclude the need for PropertyPathTraverser.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const getTypeOfChange = (properties: string[]) => {
  let type = 0;
  // TODO: Make faster
  for (const prop of properties) {
    if (isModelProperty(prop)) {
      // TODO: handle model id
      // type |= ChangeType.Mask_Model;
    } else if (isGeometricProperty(prop)) {
      type |= TypeOfChange.Geometry;
    } else if (isPlacementProperty(prop)) {
      type |= TypeOfChange.Placement;
    } else if (isParentProperty(prop)) {
      type |= TypeOfChange.Parent;
      // TODO: Relocate hidden property check so that PropertyPathTraverser doesn't need to be passed in
    } else if (!isIgnoredProperty(prop)) {
      if (isAlwaysHiddenProperty(prop)) {
        type |= TypeOfChange.Hidden;
      } else {
        type |= TypeOfChange.Property;
      }
    }
  }
  return type;
};

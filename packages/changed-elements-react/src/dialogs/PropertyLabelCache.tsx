/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { Id64String } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";

export class PropertyLabelCache {
  private static _labels: Map<string, string | undefined> = new Map<
    string,
    string | undefined
  >();

  private static _makeKey = (
    _classId: Id64String,
    propertyName: string,
  ): string => {
    // TODO: For now disregard class Id, as we need to handle it differently from the changed elements accumulation step
    // return `${classId}:${propertyName}`;
    return propertyName;
  };

  private static _extract = (
    key: string,
  ): { name: string; classId: string; } | undefined => {
    const split = key.split(":");
    if (split.length !== 2) {
      return undefined;
    }

    return {
      classId: split[0],
      name: split[1],
    };
  };

  /**
   * Get the label for a Property
   * @param classId id.
   * @param propertyName id.
   */
  public static getLabel(classId: Id64String, propertyName: string) {
    const key = PropertyLabelCache._makeKey(classId, propertyName);
    return this._labels.has(key)
      ? PropertyLabelCache._labels.get(key)
      : undefined;
  }

  /**
   * Gets all cached labels for a given property name
   * @param propertyName Property name
   */
  public static getLabels(propertyName: string): string[] {
    const labels: string[] = [];
    for (const key of this._labels.keys()) {
      const parsedKey = this._extract(key);
      if (
        parsedKey !== undefined &&
        parsedKey.name.localeCompare(propertyName) === 0
      ) {
        const label = this._labels.get(key);
        if (label !== undefined) {
          labels.push(label);
        }
      }
    }
    return labels;
  }

  public static labelsLoaded(propertyNames: string[]): boolean {
    for (const propName of propertyNames) {
      if (!this._labels.has(propName)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Set the label for a Property
   * @param classId id of the class.
   * @param propertyName name of the property.
   * @param label to set.
   */
  public static setLabel(classId: string, propertyName: string, label: string) {
    const key = PropertyLabelCache._makeKey(classId, propertyName);
    this._labels.set(key, label);
  }

  /**
   * Clears the cache
   */
  public static clearCache() {
    this._labels.clear();
  }

  /**
   * Returns true if all labels are loaded
   * @param properties Properties to check
   */
  public static allLoaded(properties: Array<{ classId: string; propertyName: string; }>): boolean {
    for (const prop of properties) {
      const key = PropertyLabelCache._makeKey(prop.classId, prop.propertyName);
      if (!PropertyLabelCache._labels.has(key)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Loads the given property labels into the cache
   * @param iModelConnection iModel Connection
   * @param properties Properties to load labels for
   */
  private static async _loadLabels(
    iModelConnection: IModelConnection,
    properties: Array<{ classId: string; propertyName: string; }>,
  ) {
    // TODO: Use class id properly
    let ecsql = "SELECT DisplayLabel as label, Name as name, Class.id as classId FROM meta.ECPropertyDef WHERE Name in (";
    properties.forEach(() => {
      ecsql += "?,";
    });
    ecsql = ecsql.substr(0, ecsql.length - 1) + ") AND DisplayLabel<>'NULL'";
    for await (const row of iModelConnection.query(
      ecsql,
      QueryBinder.from(properties.map((prop) => prop.propertyName)),
      {
        rowFormat: QueryRowFormat.UseJsPropertyNames,
      },
    )) {
      PropertyLabelCache.setLabel(
        row.classId as string,
        row.name as string,
        row.label as string,
      );
    }
  }

  /**
   * Loads the labels for the given properties in chunks
   * @param iModelConnection IModel Connection to query
   * @param properties Properties to query
   */
  public static async loadLabels(
    iModelConnection: IModelConnection,
    properties: Array<{ classId: string; propertyName: string; }>,
  ) {
    // TODO: Use class id properly
    const chunkSize = 1000;
    for (let i = 0; i < properties.length; i += chunkSize) {
      const end =
        i + chunkSize > properties.length ? properties.length : i + chunkSize;
      await PropertyLabelCache._loadLabels(
        iModelConnection,
        properties.slice(i, end),
      );
    }
  }
}

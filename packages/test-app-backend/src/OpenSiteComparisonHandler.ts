/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { ChangedECInstance, ElementDrivesElement, IModelDb } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { ChangedElements, QueryBinder, TypeOfChange } from "@itwin/core-common";
import { ExtendedTypeOfChange } from "./ChangedElementsGroupHelper";

export interface InstanceKey {
  className: string;
  id: string;
}

export interface RelationshipClassWithDirection {
  className: string;
  reverse: boolean;
}

/**
 * Query the class id based on a class name
 * @param db
 * @param className
 * @returns
 */
const getClassId = async (db: IModelDb, className: string): Promise<Id64String> => {
  const queryBinder = new QueryBinder();
  queryBinder.bindString(1, className);
  const queryReader = db.createQueryReader("SELECT ECInstanceId FROM meta.ECClassDef WHERE Name = ?", queryBinder);
  const classIds = await queryReader.toArray();
  if (classIds.length === 0) {
    throw new Error(`Class ${className} not found`);
  }
  return classIds[0][0];
};

const getInheritedClassIdsOfMany = async (db: IModelDb, classIds: string[], reverse?: boolean): Promise<Id64String[]> => {
  let query = "SELECT SourceECInstanceId FROM meta.ClassHasAllBaseClasses WHERE InVirtualSet(?, TargetECInstanceId)";
  if (reverse) {
    query = "SELECT TargetECInstanceId FROM meta.ClassHasAllBaseClasses WHERE InVirtualSet(?, SourceECInstanceId)";
  }
  const queryBinder = new QueryBinder();
  queryBinder.bindIdSet(1, classIds);
  const queryReader = db.createQueryReader(query, queryBinder);
  const results = await queryReader.toArray();
  return results.map((row) => row[0]);
};

/**
 * Removes changed elements in the given indices from the changed elements
 * @param changedElements
 * @param indices
 */
const removeChangedElementsIndices = (changedElements: ChangedElements, indices: number[]) => {
  // Remove indices in reverse order to avoid index shifting
  const indicesArray = indices.sort((a, b) => b - a);
  for (const index of indicesArray) {
    changedElements.elements.splice(index, 1);
    changedElements.type.splice(index, 1);
    changedElements.opcodes.splice(index, 1);
    changedElements.classIds.splice(index, 1);
    changedElements.parentClassIds?.splice(index, 1);
    changedElements.parentIds?.splice(index, 1);
    changedElements.modelIds?.splice(index, 1);
    changedElements.newChecksums?.splice(index, 1);
    changedElements.oldChecksums?.splice(index, 1);
    changedElements.properties?.splice(index, 1);
  }
};

/**
 * Returns all inherited classes of a given class recursively
 * @param db
 * @param className
 * @returns
 */
const getInheritedClassIds = async (db: IModelDb, className: string, reverse?: boolean): Promise<Set<Id64String>> => {
  const classId = await getClassId(db, className);
  const inheritedClassIds = await getInheritedClassIdsOfMany(db, [classId], reverse);
  return new Set([classId, ...inheritedClassIds]);
};

export interface ComparisonProcessor {
  /** Called after all changes are put together with partial unifier */
  processChangedInstances: (db: IModelDb, instances: ChangedECInstance[]) => Promise<ChangedECInstance[]>;
}

/**
 * Processor for OpenSite specific changes
 * 1. Marks elements that are driven by other elements as driven
 * 2. Marks those driven elements as Updates instead of Delete + Insert
 * 3. Marks the spatial containment of the driven elements as driven based on the OpenSite schema
 */
export class OpenSiteProcessor implements ComparisonProcessor {
  private _drivenInstances: ChangedECInstance[] = [];
  private _nonDrivenInstances: ChangedECInstance[] = [];

  private getDrivenRelationshipClassNamesForDomain(): RelationshipClassWithDirection[] {
    return [
      { className: ElementDrivesElement.className, reverse: false },
      { className: "SpatialOrganizerHoldsSpatialElements", reverse: false },
    ];
  }

  /**
   * Gets all relationship class ids that will be used to find driven elements
   * @param db
   * @returns
   */
  private async getDrivenTargetClassIds(db: IModelDb): Promise<Set<Id64String>> {
    const drivenClassNames = this.getDrivenRelationshipClassNamesForDomain();
    const relClassIds = new Set<Id64String>();
    for (const relClass of drivenClassNames) {
      const currentClassIds = await getInheritedClassIds(db, relClass.className, relClass.reverse);
      currentClassIds.forEach((classId) => relClassIds.add(classId));
    }
    return relClassIds;
  }

  private extractTypeOfChange(instance: ChangedECInstance): number {
    let typeOfChange = 0;

    // TODO: This is incomplete / wrong, fix
    for (const prop in instance) {
      if (prop.includes("Geometry")) {
        typeOfChange |= TypeOfChange.Geometry;
      } else if (prop.includes("Origin") || prop.includes("BBox")) {
        typeOfChange |= TypeOfChange.Placement;
      } else if (!prop.includes("$meta") && !prop.includes("ECClassId") && !prop.includes("ECInstanceId") && !prop.includes("SourceECInstanceId") && !prop.includes("TargetECInstanceId")) {
        typeOfChange |= TypeOfChange.Property;
      }
    }

    return typeOfChange;
  }

  /**
   * Finds all relevant driven class elements
   * @param db
   * @param instances
   */
  public async processChangedInstances(db: IModelDb, instances: ChangedECInstance[]): Promise<ChangedECInstance[]> {
    const driveMap = new Map<string, string>();
    const drivenElements = new Set<string>();

    // Find all class ids that inherit from ElementDrivesElement
    const elementDrivesElementClasses = await this.getDrivenTargetClassIds(db);

    // Find driven elements
    for (const instance of instances) {
      if (instance.ECClassId && elementDrivesElementClasses.has(instance.ECClassId)) {
        const source = instance.SourceECInstanceId;
        const target = instance.TargetECInstanceId;
        drivenElements.add(target);
        driveMap.set(source, target);
      }
    }

    this._drivenInstances = instances.filter((instance) => drivenElements.has(`${instance.ECInstanceId}`));
    this._nonDrivenInstances = instances.filter((instance) => !drivenElements.has(`${instance.ECInstanceId}`));

    // Enrich data with type of change
    for (const instance of instances) {
      instance["$comparison"] = {};
      if (this._drivenInstances.includes(instance)) {
        instance["$comparison"].type |= ExtendedTypeOfChange.Driven | TypeOfChange.Indirect | this.extractTypeOfChange(instance);
        if (instance.$meta) {
          instance.$meta.op = "Updated";
        }
      } else {
        if (instance.$meta?.op === "Updated") {
          instance["$comparison"].type |= this.extractTypeOfChange(instance);
        }
      }
    }

    return instances;
  }
}

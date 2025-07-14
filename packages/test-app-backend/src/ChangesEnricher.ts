/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { ChangedECInstance, IModelDb } from "@itwin/core-backend";
import { Id64String } from "@itwin/core-bentley";
import { QueryBinder, TypeOfChange } from "@itwin/core-common";
import { ExtendedTypeOfChange } from "./ChangedInstancesProcessor";
import { getTypeOfChange } from "./TypeOfChange";
import { RelationshipClassWithDirection } from "./RPC/ChangesRpcInterface";

export interface InstanceKey {
  className: string;
  id: string;
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

export interface ChangesEnricher {
  /** Called after all changes are put together with partial unifier */
  processChangedInstances: (db: IModelDb, instances: ChangedECInstance[]) => Promise<ChangedECInstance[]>;
}

/**
 * Options for the RelatedChangesInspector
 */
export interface RelatedChangesInspectorOptions {
  relationships?: RelationshipClassWithDirection[];
}

interface IdWithRelationship {
  id: Id64String;
  relationship: RelationshipClassWithDirection;
}

interface RelatedClassIds {
  relationship: RelationshipClassWithDirection;
  relatedClassIds: Id64String[];
}

/**
 * Processor for enriching ChangedECInstances with additional information
 * This processor does the following:
 * 1. Finds all relationships that may be relevant to the consumer
 * 2. Marks those related elements as Updates instead of Delete + Insert
 */
export class RelatedChangesEnricher implements ChangesEnricher {
  private _relationships: RelationshipClassWithDirection[] = [];

  public constructor(opts?: RelatedChangesInspectorOptions) {
    // If relationships are provided, they can be used to filter driven elements
    if (opts?.relationships) {
      this._relationships = opts.relationships;
    }
  }

  /**
   * Gets all relationship class ids that will be used to find driven elements
   * @param db
   * @returns
   */
  private async getDrivenTargetClassIds(db: IModelDb): Promise<RelatedClassIds[]> {
    const drivenClassNames = this._relationships;
    const relatedClassIds: RelatedClassIds[] = [];
    for (const relClass of drivenClassNames) {
      const relClassIds = new Set<Id64String>();
      const currentClassIds = await getInheritedClassIds(db, relClass.className, relClass.reverse);
      currentClassIds.forEach((classId) => relClassIds.add(classId));
      relatedClassIds.push({
        relationship: relClass,
        relatedClassIds: Array.from(relClassIds),
      });
    }
    return relatedClassIds;
  }

  /** TODO: Should become a separate utility function / not dependent on this "comparison processor" */
  private extractTypeOfChange(instance: ChangedECInstance): number {
    return getTypeOfChange(Object.keys(instance));
  }

  /**
   * Return the relevant related class ids to the instance
   * @param relatedClassIds
   * @param instance
   * @returns
   */
  private getRelatedClassIdsToInstance(relatedClassIds: RelatedClassIds[], instance: ChangedECInstance): RelatedClassIds | undefined {
    for (const relatedClass of relatedClassIds) {
      if (relatedClass.relatedClassIds.includes(instance.ECClassId!)) {
        return relatedClass;
      }
    }
    return undefined;
  }

  /**
   * Enriches the ChangedECInstances with additional information regarding relationships that drive changes.
   * @param db
   * @param instances
   */
  public async processChangedInstances(db: IModelDb, instances: ChangedECInstance[]): Promise<ChangedECInstance[]> {
    const driveForwardMap = new Map<string, IdWithRelationship[]>();
    const driveBackwardMap = new Map<string, IdWithRelationship[]>();
    const drivenElements = new Set<string>();

    // Find all class ids that inherit from ElementDrivesElement
    const relatedClassIds = await this.getDrivenTargetClassIds(db);

    // Find relevant relationships that the consumer is interested in
    for (const instance of instances) {
      const relatedClass = this.getRelatedClassIdsToInstance(relatedClassIds, instance);
      if (!relatedClass) {
        // Skip if no related class is found
        continue;
      }

      // If the instance is a relationship, we need to find the source and target elements
      const source = instance.SourceECInstanceId;
      const target = instance.TargetECInstanceId;
      // TODO: Do we care about class ids here
      // const sourceClassId = instance.SourceECClassId;
      // const targetClassId = instance.TargetECClassId;
      drivenElements.add(target);
      const driveBackwardEntry = driveBackwardMap.get(`${target}`);
      if (driveBackwardEntry) {
        driveBackwardEntry.push({ id: source, relationship: relatedClass.relationship });
      } else {
        driveBackwardMap.set(`${target}`, [{ id: source, relationship: relatedClass.relationship }]);
      }

      const driveForwardEntry = driveForwardMap.get(`${source}`);
      if (driveForwardEntry) {
        driveForwardEntry.push({ id: target, relationship: relatedClass.relationship });
      }
      else {
        driveForwardMap.set(`${source}`, [{ id: target, relationship: relatedClass.relationship }]);
      }
    }

    // Enrich data
    for (const instance of instances) {
      instance["$comparison"] = {};
      if (instance.$meta?.op === "Updated") {
        instance["$comparison"].type |= this.extractTypeOfChange(instance);
      }
      const backwards = driveBackwardMap.get(`${instance.ECInstanceId}`);
      if (backwards) {
        instance["$comparison"].type = ExtendedTypeOfChange.Driven;
        instance["$comparison"].drivenBy = backwards;
        // TODO: This opcode transformation should happen in the app, not in this interface
        if (instance.$meta) {
          instance.$meta.op = "Updated";
        }
      }
      const forwards = driveForwardMap.get(`${instance.ECInstanceId}`);
      if (forwards) {
        instance["$comparison"].drives = forwards;
        // TODO: Use some other mechanism to ensure that relationship sources are marked changed instead of cleaning their Indirect type
        instance["$comparison"].type ^= TypeOfChange.Indirect;
      }
    }

    return instances;
  }
}

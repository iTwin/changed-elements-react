import { AnyDb, ChangedECInstance, ChangeMetaData, ChangesetECAdaptor, PartialECChangeUnifier, SqliteChangeOp, SqliteChangesetReader } from "@itwin/core-backend";
import { DbOpcode, Id64String } from "@itwin/core-bentley";
import { ChangedElements, ChangesetFileProps } from "@itwin/core-common";

/**
 * Representation of a Changed Element during ChangesetGroup processing.
 *
 * Including extra {@link meta metadata} from the {@link PartialECChangeUnifier}'s {@link ChangedECInstance instances}
 */
export interface ChangesetGroupChangedElement {
  id: Id64String;
  classId: Id64String;
  modelId: Id64String;
  parentId: Id64String;
  parentRelClassId: Id64String;
  operation: SqliteChangeOp | string;
  properties: Set<string>;
  type: number;
  meta?: ChangeMetaData; // TODO: Only keep what we need. We can remove properties not used during processing to decrease memory usage.
}

export class ChangesetGroup {
  /**
   * Get all changes from the range of changesets, grouped together as if they were a single changeset.
   * The type of change is automatically resolved by the grouping (e.g., updated + deleted = deleted).
   * @param changesetFileProps
   * @returns EC Change Instances
   */
  private static _getGroupedChangesetChanges(changesetFileProps: Partial<ChangesetFileProps>[], db: AnyDb): ChangedECInstance[] {

  const ecChangeUnifier = new PartialECChangeUnifier();

  const changesetFilePaths = changesetFileProps
    .filter((csFile) => csFile.pathname !== undefined)
    .map((csFile) => csFile.pathname!);

  try {
    const csReader = SqliteChangesetReader.openGroup({
      changesetFiles: changesetFilePaths,
      db,
      disableSchemaCheck: true,
    });
    const csAdaptor = new ChangesetECAdaptor(csReader);
    while (csAdaptor.step()) {
      ecChangeUnifier.appendFrom(csAdaptor);
    }
  } catch (error: unknown) {
    throw Error(`Error appending changeset data: ${error as string}`);
  }

  return Array.from(ecChangeUnifier.instances);
}

  /**
 * Transforms temporary array of elements to Changed Elements result format
 * @param changedElements
 * @returns
 */
  private static  transformToAPIChangedElements (changedElements: ChangesetGroupChangedElement[]): ChangedElements  {
    const ce: ChangedElements = ChangesetGroup.createEmptyChangedElements();
    for (const elem of changedElements) {
      ce.elements.push(elem.id);
      ce.classIds.push(elem.classId);
      ce.opcodes.push(ChangesetGroup.stringToOpcode(elem.operation));
      ce.type?.push(elem.type);
      ce.parentIds?.push(elem.parentId);
      ce.parentClassIds?.push(elem.parentRelClassId);
      ce.properties?.push(Array.from(elem.properties.values()));
      ce.modelIds?.push(elem.modelId);
      // TODO: Do we need checksums anymore? If doing parallel processing, maybe...
    }

    return ce;
  }

  /**
   * Convert {@link SqliteChangeOp} string to {@link DbOpcode} number.
   *
   * Throws error if not a valid {@link SqliteChangeOp} string.
   */
  private static stringToOpcode (operation: SqliteChangeOp | string): DbOpcode  {
    switch (operation) {
      case "Inserted":
        return DbOpcode.Insert;
      case "Updated":
        return DbOpcode.Update;
      case "Deleted":
        return DbOpcode.Delete;
      default:
        throw new Error("Unknown opcode string");
    }
  }

  /**
   * @returns Empty ChangedElements object
   */
  private static createEmptyChangedElements = (): ChangedElements => {
    return {
      elements: [],
      classIds: [],
      modelIds: [],
      opcodes: [],
      type: [],
      properties: [],
      parentIds: [],
      parentClassIds: [],
    };
  };

}

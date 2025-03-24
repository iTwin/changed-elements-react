import { AnyDb, BriefcaseDb, BriefcaseManager, ChangedECInstance, ChangeMetaData, ChangesetECAdaptor, IModelDb, IModelHost, PartialECChangeUnifier, RequestNewBriefcaseArg, SqliteChangeOp, SqliteChangesetReader } from "@itwin/core-backend";
import { DbOpcode, Id64String, OpenMode } from "@itwin/core-bentley";
import { BentleyCloudRpcManager, BriefcaseIdValue, ChangedElements, ChangesetFileProps, ChangesetIdWithIndex, IModelRpcProps, IModelVersion, TypeOfChange } from "@itwin/core-common";
import { AuthClient } from './RPC/ChangesetGroupRPCInterface';

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

  private static async _downloadChangesetFiles(startChangesetIdWithIndex: ChangesetIdWithIndex,endChangesetIdWithIndex: ChangesetIdWithIndex, iModelId: string, authToken: string): Promise<ChangesetFileProps[]> {
    const authClient: AuthClient = {
      getAccessToken: function (): Promise<string> {
        return Promise.resolve(authToken);
      },
    }
    IModelHost.authorizationClient = authClient;
    try {
      const csFileProps = [];
      // TODO: should the first changeset in a reverse sync really be included even though its 'initialized branch provenance'? The answer is no, its a bug that needs to be fixed.
      const fileProps = await IModelHost.hubAccess.downloadChangesets({
        iModelId: iModelId,
        targetDir: BriefcaseManager.getChangeSetsPath(iModelId),
        range: { first: startChangesetIdWithIndex.index!, end: endChangesetIdWithIndex.index! },
        accessToken: authToken,
      });
      csFileProps.push(...fileProps);
      return csFileProps;
    } catch (e: unknown) {
      return [];
    }
  }

  public static async runGroupComparison(startChangesetIdWithIndex: ChangesetIdWithIndex,endChangesetIdWithIndex: ChangesetIdWithIndex, iModelId: string, authToken: string, contextId:string,_iModelToken: IModelRpcProps): Promise<ChangedElements> {
    const changesetPaths = await this._downloadChangesetFiles(startChangesetIdWithIndex, endChangesetIdWithIndex, iModelId, authToken);
    const db = IModelDb.findByKey(_iModelToken.key);
    const changedECInstance = this._getGroupedChangesetChanges(changesetPaths, db)
    const changedElements = this.transformToAPIChangedElements(changedECInstance);
    return changedElements;
  }

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
  private static transformToAPIChangedElements(changedElements: ChangedECInstance[]): ChangedElements  {
    const ce: ChangedElements = ChangesetGroup.createEmptyChangedElements();
    const ceMap: Map<string, ChangedECInstance> = new Map<string, ChangedECInstance>();
    changedElements.forEach((elem) => {
      if (!ceMap.has(`${elem.ECInstanceId}:${elem.ECClassId}`)) {
        ceMap.set(`${elem.ECInstanceId}:${elem.ECClassId}`, elem);
      }
     });
    for (const elem of ceMap.values()) {
      ce.elements.push(elem.ECInstanceId);
      ce.classIds.push(elem.ECClassId ?? "");
      ce.opcodes.push(ChangesetGroup.stringToOpcode(elem.$meta?.op ?? ""));
      ce.type.push(TypeOfChange.NoChange);
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

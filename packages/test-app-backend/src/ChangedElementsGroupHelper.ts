/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  AnyDb,
  BriefcaseDb,
  BriefcaseManager,
  ChangedECInstance,
  ChangeMetaData,
  ChangesetECAdaptor,
  IModelDb,
  IModelHost,
  PartialECChangeUnifier,
  RequestNewBriefcaseArg,
  SqliteChangeOp,
  SqliteChangesetReader,
} from "@itwin/core-backend";
import { DbOpcode, Id64String, OpenMode, OrderedId64Iterable } from "@itwin/core-bentley";
import {
  BentleyCloudRpcManager,
  BriefcaseIdValue,
  ChangedElements,
  ChangesetFileProps,
  ChangesetIdWithIndex,
  IModelRpcProps,
  IModelVersion,
  QueryBinder,
  TypeOfChange,
} from "@itwin/core-common";
import { AuthClient } from "./RPC/ChangesetGroupRPCInterface";
import { ComparisonProcessor } from "./OpenSiteComparisonHandler.js";

export enum ExtendedTypeOfChange {
  Driven = 64,
}

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

/**
 * Options for processing handlers for domain-specific logic
 */
export interface ProcessingOptions {
  processor: ComparisonProcessor;
}

export class ChangesetGroup {
  /**
   *
   * @param _processingOpts Any special processing options
   */
  public constructor(private _processingOpts?: ProcessingOptions) { }

  private async _downloadChangesetFiles(
    startChangesetIdWithIndex: ChangesetIdWithIndex,
    endChangesetIdWithIndex: ChangesetIdWithIndex,
    iModelId: string,
    authToken: string,
  ): Promise<ChangesetFileProps[]> {
    const authClient: AuthClient = {
      getAccessToken: function (): Promise<string> {
        return Promise.resolve(authToken);
      },
    };
    IModelHost.authorizationClient = authClient;
    try {
      const csFileProps = [];
      // TODO: should the first changeset in a reverse sync really be included even though its 'initialized branch provenance'? The answer is no, its a bug that needs to be fixed.
      const fileProps = await IModelHost.hubAccess.downloadChangesets({
        iModelId: iModelId,
        targetDir: BriefcaseManager.getChangeSetsPath(iModelId),
        range: {
          first: startChangesetIdWithIndex.index!,
          end: endChangesetIdWithIndex.index!,
        },
        accessToken: authToken,
      });
      csFileProps.push(...fileProps);
      return csFileProps;
    } catch (e: unknown) {
      return [];
    }
  }

  public async runGroupComparison(
    iModelToken: IModelRpcProps,
    startChangesetIdWithIndex: ChangesetIdWithIndex,
    endChangesetIdWithIndex: ChangesetIdWithIndex,
    authToken: string,
  ): Promise<ChangedElements> {
    const iModelId = iModelToken.iModelId!;

    const changesetPaths = await this._downloadChangesetFiles(
      startChangesetIdWithIndex,
      endChangesetIdWithIndex,
      iModelId,
      authToken,
    );

    const db = IModelDb.findByKey(iModelToken.key);
    const changedECInstances = await this._getGroupedChangesetChanges(
      changesetPaths,
      db,
    );

    const changedElements =
      await this.transformToAPIChangedElements(db, changedECInstances);

    // Do any extra processing of the changed elements if a processor is provided
    if (this._processingOpts?.processor) {
      return this._processingOpts.processor.processChangedElements(
        db,
        changedElements,
      );
    }

    return changedElements;
  }

  /**
   * Get all changes from the range of changesets, grouped together as if they were a single changeset.
   * The type of change is automatically resolved by the grouping (e.g., updated + deleted = deleted).
   * @param changesetFileProps
   * @returns EC Change Instances
   */
  private async _getGroupedChangesetChanges(
    changesetFileProps: Partial<ChangesetFileProps>[],
    db: IModelDb,
  ): Promise<ChangedECInstance[]> {
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

    const instances = Array.from(ecChangeUnifier.instances);

    // Use any passed processor to process the instances
    const comparisonProcessor = this._processingOpts?.processor;
    if (comparisonProcessor) {
      await comparisonProcessor.processChangedInstances(db, instances);
    }

    return instances;
  }

  /**
   * Returns a map of the elements to models they belong to
   * @param db
   * @param changedElements
   * @returns
   */
  private async _getModelIds(db: IModelDb, instances: ChangedECInstance[]): Promise<Map<Id64String, Id64String>> {
    const query = "SELECT ECInstanceId, Model.Id FROM Bis.Element WHERE InVirtualSet(?, ECInstanceId)";
    const elemToModel = new Map<Id64String, Id64String>();
    const queryBinder = new QueryBinder();

    const instanceIds = instances
        .filter((elem) => elem.SourceECInstanceId === undefined)
        .map((elem) => elem.ECInstanceId);

    queryBinder.bindIdSet(1, OrderedId64Iterable.sortArray(instanceIds));
    for await (const row of db.createQueryReader(query, queryBinder)) {
      elemToModel.set(row[0], row[1]);
    }
    return elemToModel;
  }

  /**
   * Transforms temporary array of elements to Changed Elements result format
   * TODO: This should be done in the frontend, not the backend.
   * @param changedElements
   * @returns
   */
  private async transformToAPIChangedElements(
    db: IModelDb,
    changedElements: ChangedECInstance[],
  ): Promise<ChangedElements> {
    const ce: ChangedElements = this.createEmptyChangedElements();
    const ceMap: Map<string, ChangedECInstance> = new Map<
      string,
      ChangedECInstance
    >();
    changedElements.forEach((elem) => {
      if (!ceMap.has(`${elem.ECInstanceId}:${elem.ECClassId}`)) {
        ceMap.set(`${elem.ECInstanceId}:${elem.ECClassId}`, elem);
      }
    });
    // const map = await this._getModelIds(db, changedElements)
    for (const elem of ceMap.values()) {
      ce.elements.push(elem.ECInstanceId);
      ce.classIds.push(elem.ECClassId ?? "");
      ce.opcodes.push(this.stringToOpcode(elem.$meta?.op ?? ""));
      ce.type.push(TypeOfChange.NoChange);
      // ce.modelIds?.push(map.get(elem.ECInstanceId) ?? "0x1");
      // TODO: Do we need checksums anymore? If doing parallel processing, maybe...
    }
    return ce;
  }

  /**
   * Convert {@link SqliteChangeOp} string to {@link DbOpcode} number.
   *
   * Throws error if not a valid {@link SqliteChangeOp} string.
   */
  private stringToOpcode(operation: SqliteChangeOp | string): DbOpcode {
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
  private createEmptyChangedElements = (): ChangedElements => {
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

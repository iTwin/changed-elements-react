/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  BriefcaseManager,
  ChangedECInstance,
  ChangesetECAdaptor,
  IModelDb,
  IModelHost,
  PartialECChangeUnifier,
  SqliteChangesetReader
} from "@itwin/core-backend";
import {
  AuthorizationClient,
  ChangesetFileProps,
  ChangesetIdWithIndex,
  IModelRpcProps
} from "@itwin/core-common";
import { ChangedInstancesResult } from "./RPC/ChangesRpcInterface";
import { ChangesEnricher } from "./ChangesEnricher";

/**
 * Options for processing handlers for domain-specific logic
 */
export interface ProcessingOptions {
  enricher: ChangesEnricher;
}

export class ChangedInstancesProcessor {
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
    const authClient: AuthorizationClient = {
      getAccessToken: function (): Promise<string> {
        return Promise.resolve(authToken);
      },
    };
    IModelHost.authorizationClient = authClient;
    try {
      const csFileProps = [];
      const startIndex = startChangesetIdWithIndex.index;
      const endIndex = endChangesetIdWithIndex.index;

      if (startIndex === undefined || endIndex === undefined) {
        throw new Error("Invalid changeset indices provided");
      }

      const fileProps = await BriefcaseManager.downloadChangesets({
        iModelId: iModelId,
        targetDir: BriefcaseManager.getChangeSetsPath(iModelId),
        range: {
          first: startIndex,
          end: endIndex,
        },
        accessToken: authToken,
      });
      csFileProps.push(...fileProps);
      return csFileProps;
    } catch (e: unknown) {
      return [];
    }
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

    // Remove geometry streams, no need to return them
    for (const instance of instances) {
      if (instance["GeometryStream"]) {
        instance["GeometryStream"] = "Changed";
      }
    }

    // Use any passed processor to process the instances
    const comparisonProcessor = this._processingOpts?.enricher;
    if (comparisonProcessor) {
      return comparisonProcessor.processChangedInstances(db, instances);
    }

    return instances;
  }

  /**
   * Returns the changed ec instances from the range of changesets.
   * This results in downloading all changeset files in the range and processing them.
   * @param iModelToken
   * @param startChangesetIdWithIndex
   * @param endChangesetIdWithIndex
   * @param authToken
   * @returns
   */
  public async getChangedInstances(
    iModelToken: IModelRpcProps,
    startChangesetIdWithIndex: ChangesetIdWithIndex,
    endChangesetIdWithIndex: ChangesetIdWithIndex,
    authToken: string,
  ): Promise<ChangedInstancesResult> {
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

    return { changedInstances: changedECInstances };
  }

}

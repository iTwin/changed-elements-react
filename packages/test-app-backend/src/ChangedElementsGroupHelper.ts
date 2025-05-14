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
  SqliteChangesetReader,
} from "@itwin/core-backend";
import {
  ChangesetFileProps,
  ChangesetIdWithIndex,
  IModelRpcProps,
} from "@itwin/core-common";
import { AuthClient, ChangesetGroupResult } from "./RPC/ChangesetGroupRPCInterface";
import { ComparisonProcessor } from "./OpenSiteComparisonHandler";

export enum ExtendedTypeOfChange {
  Driven = 64,
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
  ): Promise<ChangesetGroupResult> {
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
      return await comparisonProcessor.processChangedInstances(db, instances);
    }

    return instances;
  }
}

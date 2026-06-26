/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import path from "path";
import { CheckpointManager, IModelHost, SnapshotDb } from "@itwin/core-backend";
import { IModelStatus } from "@itwin/core-bentley";
import { IModelConnectionProps, IModelError, IModelRpcOpenProps } from "@itwin/core-common";
import { IModelReadRpcImpl } from "@itwin/core-backend/lib/cjs/rpc-impl/IModelReadRpcImpl";
import { RpcTrace } from "@itwin/core-backend/lib/cjs/rpc/tracing";

/**
 * Falls back to local standalone snapshot open when exact V2 checkpoint is missing.
 * This avoids acquiring Hub briefcase ids in the fallback path.
 */
export class FallbackIModelReadRpcImpl extends IModelReadRpcImpl {
  public override async getConnectionProps(tokenProps: IModelRpcOpenProps): Promise<IModelConnectionProps> {
    try {
      return await super.getConnectionProps(tokenProps);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      const isMissingV2Checkpoint =
        error instanceof IModelError &&
        error.errorNumber === IModelStatus.NotFound &&
        message.includes("V2 checkpoint not found");

      if (!isMissingV2Checkpoint) {
        throw error;
      }

      const iTwinId = tokenProps.iTwinId;
      const iModelId = tokenProps.iModelId;
      const changeset = tokenProps.changeset;
      if (!iTwinId || !iModelId || !changeset) {
        throw error;
      }

      const checkpoint = {
        iTwinId,
        iModelId,
        changeset,
        accessToken: RpcTrace.expectCurrentActivity.accessToken,
      };

      const key = CheckpointManager.getKey(checkpoint);
      const existing = SnapshotDb.tryFindByKey(key);
      if (existing) {
        return existing.toJSON();
      }

      const localFile = path.join(
        IModelHost.cacheDir,
        "rpc-fallback-checkpoints",
        iModelId,
        `${changeset.id}.bim`,
      );

      await CheckpointManager.downloadCheckpoint({
        checkpoint,
        localFile,
      });

      const db = SnapshotDb.openFile(localFile, { key });
      return db.toJSON();
    }
  }
}

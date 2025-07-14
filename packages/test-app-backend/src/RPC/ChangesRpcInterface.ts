/* eslint-disable prefer-rest-params */
/* eslint-disable prefer-spread */
import { ChangedECInstance } from "@itwin/core-backend";
import { RpcInterface, RpcManager, IModelRpcProps, ChangesetIdWithIndex } from "@itwin/core-common";

/**
 * Interface for the result of a changeset group RPC call.
 */
export interface ChangedInstancesResult {
  changedInstances: ChangedECInstance[];
}

/**
 * Interface for providing relationship class names and their direction for categorizing changes driven by relationships.
 */
export interface RelationshipClassWithDirection {
  className: string;
  reverse: boolean;
}

/**
 * RPC interface for querying changes between two changesets.
 */
export abstract class ChangesRpcInterface extends RpcInterface {
  public static readonly interfaceName = "ChangesRpcInterface"; // The immutable name of the interface
  public static interfaceVersion = "0.0.1"; // The API version of the interface
  public static getClient() {
    return RpcManager.getClientForInterface(this);
  }

  public async getChangedInstances(
    iModelToken: IModelRpcProps,
    startChangeset: ChangesetIdWithIndex,
    endChangeset: ChangesetIdWithIndex,
    relationships: RelationshipClassWithDirection[],
    authToken: string,
  ): Promise<ChangedInstancesResult> {
    return this.forward(arguments);
  }
}

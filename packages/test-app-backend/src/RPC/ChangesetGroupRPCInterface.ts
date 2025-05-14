/* eslint-disable prefer-rest-params */
/* eslint-disable prefer-spread */
import { RpcInterface, RpcManager, IModelRpcProps, ChangesetIdWithIndex, ChangedElements } from "@itwin/core-common";

export abstract class ChangesetGroupRPCInterface extends RpcInterface {
  public static readonly interfaceName = "ChangesetGroupRBCInterface"; // The immutable name of the interface
  public static interfaceVersion = "0.0.1"; // The API version of the interface
  public static getClient() {
    return RpcManager.getClientForInterface(this);
  }

  // TODO: This should not return any ChangedElements specific, perhaps just some new interface with a ChangedInstance array
  public async getChangesetGroup(
    iModelToken: IModelRpcProps,
    startChangeset: ChangesetIdWithIndex,
    endChangeset: ChangesetIdWithIndex,
    authToken: string,
  ): Promise<ChangedElements> {
    return this.forward(arguments);
  }
}

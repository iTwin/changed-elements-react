import { ChangesetIdWithIndex, IModelRpcProps, RpcInterface } from "@itwin/core-common";
import { ChangesetGroupRPCInterface } from "./ChangesetGroupRPCInterface.js";

export class ChangesetGroupRPCImpl extends RpcInterface implements ChangesetGroupRPCInterface {
  public getChangesetGroup(_iModelToken: IModelRpcProps , endChangeset:ChangesetIdWithIndex ): Promise<unknown> {
    throw new Error("Method not implemented.");
  }
}

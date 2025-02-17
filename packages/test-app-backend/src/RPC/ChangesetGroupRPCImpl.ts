import { ChangesetIdWithIndex, IModelRpcProps, RpcInterface } from "@itwin/core-common";
import { ChangesetGroupRPCInterface } from "./ChangesetGroupRPCInterface";
import { ChangesetGroup } from "../ChangeElementsGroupHelper";

export class ChangesetGroupRPCImpl extends RpcInterface implements ChangesetGroupRPCInterface {
  public async getChangesetGroup(_iModelToken: IModelRpcProps, endChangeset: ChangesetIdWithIndex, authToken:string ): Promise<unknown> {
    await  ChangesetGroup._downloadChangesetFiles(endChangeset, _iModelToken.iModelId!, authToken);
    return Promise.resolve("success");
  }
}

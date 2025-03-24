import { ChangedElements, ChangesetIdWithIndex, IModelRpcProps, RpcInterface } from "@itwin/core-common";
import { ChangesetGroupRPCInterface } from "./ChangesetGroupRPCInterface";
import { ChangesetGroup } from "../ChangeElementsGroupHelper";

export class ChangesetGroupRPCImpl extends RpcInterface implements ChangesetGroupRPCInterface {
  public async getChangesetGroup(_iModelToken: IModelRpcProps, startChangeset: ChangesetIdWithIndex, endChangeset: ChangesetIdWithIndex, authToken: string): Promise<ChangedElements> {
    return ChangesetGroup.runGroupComparison(startChangeset, endChangeset, _iModelToken.iModelId!, authToken, _iModelToken.iTwinId!,_iModelToken);
  }
}

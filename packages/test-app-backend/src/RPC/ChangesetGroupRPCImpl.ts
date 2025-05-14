import { ChangesetIdWithIndex, IModelRpcProps, RpcInterface } from "@itwin/core-common";
import { ChangesetGroupResult, ChangesetGroupRPCInterface } from "./ChangesetGroupRPCInterface";
import { ChangesetGroup } from "../ChangedElementsGroupHelper";
import { OpenSiteProcessor } from "../OpenSiteComparisonHandler";

/**
 * RPC implementation for changes querying
 */
export class ChangesetGroupRPCImpl extends RpcInterface implements ChangesetGroupRPCInterface {
  /**
   * Returns changes between two changesets.
   * @param iModelToken
   * @param startChangeset
   * @param endChangeset
   * @param authToken
   * @returns
   */
  public async getChangesetGroup(iModelToken: IModelRpcProps, startChangeset: ChangesetIdWithIndex, endChangeset: ChangesetIdWithIndex, authToken: string): Promise<ChangesetGroupResult> {
    // Create instance
    const changesetGroup = new ChangesetGroup({ processor: new OpenSiteProcessor()});
    // Run changeset group comparison
    return changesetGroup.runGroupComparison(iModelToken, startChangeset, endChangeset, authToken);
  }
}

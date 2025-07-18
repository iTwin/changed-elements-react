import { ChangesetIdWithIndex, IModelRpcProps, RpcInterface } from "@itwin/core-common";
import { ChangedInstancesResult, ChangesRpcInterface, RelationshipClassWithDirection } from "./ChangesRpcInterface";
import { ChangedInstancesProcessor } from "../ChangedInstancesProcessor";
import { RelatedChangesEnricher } from "../ChangesEnricher";

/**
 * RPC implementation for changes querying
 */
export class ChangesRpcImpl extends RpcInterface implements ChangesRpcInterface {
  /**
   * Returns changes between two changesets.
   * @param iModelToken
   * @param startChangeset
   * @param endChangeset
   * @param relationships
   * @param authToken
   * @returns
   */
  public async getChangedInstances(iModelToken: IModelRpcProps, startChangeset: ChangesetIdWithIndex, endChangeset: ChangesetIdWithIndex, relationships: RelationshipClassWithDirection[], authToken: string): Promise<ChangedInstancesResult> {
    // Create instance
    const processor = new ChangedInstancesProcessor({ enricher: new RelatedChangesEnricher({ relationships })});
    // Run changeset group comparison
    return processor.getChangedInstances(iModelToken, startChangeset, endChangeset, authToken);
  }
}

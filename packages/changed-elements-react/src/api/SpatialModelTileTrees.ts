/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { Id64String } from "@itwin/core-bentley";
import { GeometricModel3dState, IModelConnection, SpatialViewState, TileTreeReference } from "@itwin/core-frontend";

export class SpatialModelTileTrees {
  protected _allLoaded = false;
  protected readonly _view: SpatialViewState;
  protected _treeRefs = new Map<Id64String, TileTreeReference>();
  private _swapTreeRefs = new Map<Id64String, TileTreeReference>();
  public constructor(
    view: SpatialViewState,
    private _targetModels: Set<Id64String> | undefined,
  ) {
    this._view = view;
  }
  public markDirty(): void {
    this._allLoaded = false;
  }
  private load(): void {
    if (this._allLoaded) {
      return;
    }
    this._allLoaded = true;
    const prev = this._treeRefs;
    const cur = this._swapTreeRefs;
    this._treeRefs = cur;
    this._swapTreeRefs = prev;
    cur.clear();

    const processModel = (modelId: string) => {
      const existing = prev.get(modelId);
      if (undefined !== existing) {
        cur.set(modelId, existing);
        return;
      }
      const model = this._iModel.models.getLoaded(modelId);
      const model3d =
        undefined !== model ? model.asGeometricModel3d : undefined;
      if (undefined !== model3d) {
        const ref = this.createTileTreeReference(model3d);
        if (undefined !== ref) {
          cur.set(modelId, ref);
        }
      }
    };

    this._view.modelSelector.models.forEach(processModel);
    // Ensure we process models that were not in the current view state and may only exist in the other iModel
    if (this._targetModels) {
      this._targetModels.forEach(processModel);
    }
  }
  public forEach(func: (treeRef: TileTreeReference) => void): void {
    this.load();
    for (const value of this._treeRefs.values()) {
      func(value);
    }
  }
  protected createTileTreeReference(model: GeometricModel3dState): TileTreeReference | undefined {
    return model.createTileTreeReference(this._view);
  }
  protected get _iModel(): IModelConnection {
    return this._view.iModel;
  }
}

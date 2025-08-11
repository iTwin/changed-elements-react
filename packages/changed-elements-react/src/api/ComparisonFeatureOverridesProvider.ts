/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { FeatureOverrideProvider, FeatureSymbology, TiledGraphicsProvider, TileTreeReference, Viewport, IModelConnection, ViewState2d } from "@itwin/core-frontend";
import { SpatialModelTileTrees } from "./SpatialModelTileTrees.js";
import { Reference, Trees } from "./VersionCompareTiles.js";
import { ChangedECInstance } from "./VersionCompare.js";
import { FeatureAppearance, RgbColor } from "@itwin/core-common";

/**
 * Options for the ComparisonFeatureOverridesProvider
 */
export interface ComparisonFeatureOverridesProviderOptions {
  /** Appearance to use for ChangedECInstances marked "Deleted" in their $meta bag. Defaults to red. */
  deletedAppearance?: FeatureAppearance;
  /** Appearance to use for ChangedECInstances marked "Updated" in their $meta bag. Defaults to blue. */
  modifiedAppearance?: FeatureAppearance;
  /** Appearance to use for ChangedECInstances marked "Inserted" in their $meta bag. Defaults to green. */
  addedAppearance?: FeatureAppearance;
  /** Appearance to use for other elements that have not changed. Defaults to undefined. */
  unchangedAppearance?: FeatureAppearance;
  /**
   * Optional parameter provide custom appearances for changed instances
   * Returning undefined will use the default appearance based on the opcode
   * You can hide the element by returning a transparent appearance
   * Note: Transparent elements will still be visible when selected
   *
   * @example
   * ```typescript
   * // Make inserted elements fully transparent
   * const customAppearanceProvider = (instance) => {
   *   if (instance.$meta?.op === "Inserted") {
   *     return FeatureAppearance.fromJSON({ rgb: new RgbColor(0, 0, 0, 0) }); // Fully transparent
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Make specific element appear red
   * const customAppearanceProvider = (instance) => {
   *  if (instance.ECInstanceId === "0x123") {
   *    return FeatureAppearance.fromJSON({ rgb: new RgbColor(255, 0, 0) });
   *  }
   *  return undefined; // Use default appearance
   * }
   * ```
   *
   * @param instance ChangedECInstance to get the custom appearance for
   * @returns App defined FeatureAppearance for the given ChangedECInstance
   */
  customAppearanceProvider?: (instance: ChangedECInstance) => FeatureAppearance | undefined;
}

/**
 * Provides light-weight visualization of ChangedECInstances
 *
 * @example
 * ```typescript
 * // Start simple visualization
 * const vp = IModelApp.viewManager.selectedView!;
 * const provider = new ComparisonFeatureOverridesProvider(vp);
 * // Set the changed instances to visualize
 * provider.setChangedInstances(changedInstances);
 * ```
 *
 * @example
 * ```typescript
 * // Start visualization with custom options for overriding appearances
 * const vp = IModelApp.viewManager.selectedView!;
 * const opts: ComparisonFeatureOverridesProviderOptions = {
 *   deletedAppearance: FeatureAppearance.fromJSON({ rgb: new RgbColor(204, 0, 0) }), // Red for deleted
 *   modifiedAppearance: FeatureAppearance.fromJSON({ rgb: new RgbColor(0, 100, 200) }), // Blue for modified
 *   addedAppearance: FeatureAppearance.fromJSON({ rgb: new RgbColor(86, 170, 28) }), // Green for added
 *   unchangedAppearance: FeatureAppearance.fromJSON({ rgb: new RgbColor(200, 200, 200) }), // Gray for unchanged
 *   customAppearanceProvider: (instance) => {
 *     if (instance.ECInstanceId === "0x1") {
 *       return FeatureAppearance.fromJSON({ rgb: new RgbColor(100, 0, 100) }); // Specific element appears purple
 *     }
 *     return undefined; // Use default appearance
 *   }
 * };
 *
 * // Create provider with custom options and set changed instances to visualize
 * const provider = new ComparisonFeatureOverridesProvider(vp, opts);
 * provider.setChangedInstances(changedInstances);
 * ```
 */
export class ComparisonFeatureOverridesProvider implements TiledGraphicsProvider, FeatureOverrideProvider {
  private readonly _trees: SpatialModelTileTrees | undefined;
  private readonly _treeRef2d: TileTreeReference | undefined;
  private _instances: ChangedECInstance[] = [];

  /**
   * Creates a new ComparisonFeatureOverridesProvider to visualize changed instances
   * @param _vp Viewport to apply the overrides to
   * @param _options Feature override options for adding custom appearance to changed instances
   * @param targetIModel Optional. Connection to the target iModel to visualize deleted changed instances
   * @param targetIModelModels Model Ids to filter the target iModel by
   * @param targetIModelCategories Category Ids to filter the target iModel by
   */
  public constructor(
    private _vp: Viewport,
    private _options: ComparisonFeatureOverridesProviderOptions = {},
    targetIModel?: IModelConnection,
    targetIModelModels?: Set<string>,
    targetIModelCategories?: Set<string>,
  ) {
    // Initialize the tile trees and references if provided with a target iModel
    if (targetIModel) {
      const symbology = new FeatureSymbology.Overrides(_vp);
      if (_vp.view.is3d()) {
        this._trees = new Trees(targetIModelModels, targetIModelCategories, _vp, symbology);
      } else {
        const viewState = _vp.view.clone(targetIModel) as ViewState2d;
        const model = viewState.getViewedModel();
        if (undefined !== model) {
          this._treeRef2d = new Reference(model.createTileTreeReference(viewState), symbology);
        }
      }
    }
  }

  /**
   * Update the override options for changing appearance of changed instances
   * This will invalidate the viewport to apply the new options
   *
   * @param options New feature override options
   */
  public setOverrideOptions(options: ComparisonFeatureOverridesProviderOptions): void {
    this._options = options;
    // Re-set symbology overrides to reflect the new options
    this._vp.invalidateSymbologyOverrides();
  }

  /**
   * Set the changed instances to be used for symbology overrides
   * @param changedInstances
   */
  public setChangedInstances(changedInstances: ChangedECInstance[]): void {
    // This method is not used in the current implementation
    // but can be used to set changed instances if needed.
    this._instances = changedInstances;

    // Re-set symbology overrides to reflect the new instances
    this._vp.invalidateSymbologyOverrides();
  }

  /**
   * Gets desired appearance for the given instance.
   * @param instance
   * @returns
   */
  private _getAppearanceForInstance(instance: ChangedECInstance): FeatureAppearance | undefined {
    // Allow custom appearance provider to override the default behavior
    if (this._options.customAppearanceProvider) {
      const appearance = this._options.customAppearanceProvider(instance);
      if (appearance) {
        return appearance;
      }
    }

    // Default appearances based on opcode
    switch (instance.$meta?.op) {
      case "Inserted":
        return this._options.addedAppearance ?? FeatureAppearance.fromJSON({ rgb: new RgbColor(86, 170, 28)});
      case "Updated":
        return this._options.modifiedAppearance ?? FeatureAppearance.fromJSON({ rgb: new RgbColor(0, 100, 200)});
      case "Deleted":
        return this._options.deletedAppearance ?? FeatureAppearance.fromJSON({ rgb: new RgbColor(204, 0, 0)});
    }

    return undefined;
  }

  /**
   * Display the tile tree from the target iModel
   * @param _viewport
   * @param func
   */
  forEachTileTreeRef(_viewport: Viewport, func: (ref: TileTreeReference) => void): void {
    // 3D
    this._trees?.forEach(func);

    // 2D
    if (this._treeRef2d !== undefined) {
      func(this._treeRef2d);
    }
  }

  /**
   * Colorize simple comparison overrides
   * @param _overrides
   * @param _viewport
   */
  addFeatureOverrides(_overrides: FeatureSymbology.Overrides, _viewport: Viewport): void {
    // Default appearance handling
    if (this._options.unchangedAppearance) {
      _overrides.setDefaultOverrides(this._options.unchangedAppearance, true);
    }

    for (const instance of this._instances) {
      const appearance = this._getAppearanceForInstance(instance);
      if (appearance) {
        _overrides.override({ elementId: instance.ECInstanceId, appearance: appearance });
      }
    }
  }
}

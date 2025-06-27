/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, DbOpcode, Id64, type Id64Arg, type Id64Set, type Id64String } from "@itwin/core-bentley";
import { FeatureAppearance, RgbColor, type EmphasizeElementsProps, type RgbColorProps } from "@itwin/core-common";
import {
  ChangeFlags, FeatureSymbology, IModelConnection, PerModelCategoryVisibility, SpatialModelState,
  SpatialViewState, TileTreeReference, Viewport, ViewState2d, type FeatureOverrideProvider,
  type TiledGraphicsProvider
} from "@itwin/core-frontend";

import type { ChangedElement, ChangedElementEntry } from "./ChangedElementEntryCache.js";
import { ModelsCategoryCache } from "./ModelsCategoryCache.js";
import { SpatialModelTileTrees } from "./SpatialModelTileTrees.js";
import { VersionCompareVisualizationManager } from "./VersionCompareVisualization.js";

interface PerModelCategoryVisibilityProps {
  modelId: string;
  categoryId: string;
  visible: boolean;
}

const unchangedAppearance = FeatureAppearance.fromJSON({
  rgb: new RgbColor(80, 80, 80),
  transparency: 0.5,
  nonLocatable: true,
});
const hiddenAppearance = FeatureAppearance.fromJSON({
  rgb: new RgbColor(80, 80, 80),
  transparency: 1.0,
  nonLocatable: true,
});
let useCachedProviderProps = true;
let cachedProviderProps: ProviderProps | undefined;
let cachedPerModelCategoryProps: PerModelCategoryVisibilityProps[] | undefined;
const refreshEvent = new BeEvent<() => void>();

export interface VersionDisplayOptions {
  hideUnchanged: boolean;
  hideRemoved: boolean;
  hideModified: boolean;
  wantModified?: boolean;
  neverDrawn?: Set<string>;
  changedModels?: Set<string>;
  hiddenDeletedElements?: Set<string>;
  emphasized?: boolean;
}

class Trees extends SpatialModelTileTrees {
  private readonly _provider: Provider;

  public constructor(
    provider: Provider,
    private _models: Set<string> | undefined,
    private _categories: Set<string> | undefined,
  ) {
    super(provider.viewport.view as SpatialViewState, _models);

    // Ensure the given models are loaded into the viewstate
    if (this._models) {
      for (const model of this._models) {
        this._view.addViewedModel(model);
      }
    }

    // Ensure deleted elements in deleted or unused categories can be seen
    if (this._categories) {
      this._view.categorySelector.addCategories(this._categories);
    }

    this._provider = provider;
  }

  protected override get _iModel() {
    return this._provider.iModel;
  }

  protected override createTileTreeReference(model: SpatialModelState): TileTreeReference | undefined {
    if (!this._models || this._models.has(model.id)) {
      return new Reference(
        model.createTileTreeReference(this._provider.viewport.view),
        this._provider,
      );
    }

    return undefined;
  }
}

export interface ProviderProps {
  changedElems: ChangedElementEntry[];
  options?: VersionDisplayOptions;
  internalNeverDrawn: Id64Set;
  internalAlwaysDrawn: Id64Set;
  exclusive: boolean;
}

/**
 * Added to a Viewport to supply graphics from the secondary IModelConnection (e.g. the target iModel being compared against).
 * We do this to be able to show removed elements that are not available in the current iModel, and get tiles from the other IModelConnection for them.
 *
 * Notes about Hiding/Isolating/Emphasizing elements:
 * There are the "internal" neverDrawn/alwaysDrawn/exclusive properties (seen in the member variables below)
 * And there's also the passed options (this._options) that contain a separate list of never drawn elements and properties.
 * Internal neverDrawn/alwaysDrawn/exclusive are used to make Context Tools (e.g. Hide/Isolate/Emphasize) work while in comparison
 * The passed VersionDisplayOptions (this._options) provide a separate way to do version compare specific actions:
 * 1. Hide/Show unchanged geometry: done by changing the default appearance
 * 2. Hide/Show removed elements: need to be handled separately since we have special logic to display elements from another iModel
 * 3. Hide specific elements via options.neverDrawn: These are used to let the user toggle visibility (on/off) for elements in comparison
 * 4. Changed Models: This property is used to determine which models should we load from the other iModel to get better performance
 */
export class Provider
  implements TiledGraphicsProvider, FeatureOverrideProvider {
  private readonly _trees: SpatialModelTileTrees | undefined;
  private _treeRef2d: Reference | undefined;
  public readonly iModel: IModelConnection;
  public secondaryIModelOverrides: FeatureSymbology.Overrides;
  public visibleChangedElems: ChangedElementEntry[];
  public hiddenChangedElems: ChangedElementEntry[];
  public readonly viewport: Viewport;
  private readonly _removals: Array<() => void> = [];
  private _options: VersionDisplayOptions | undefined;

  private _currentTransparency = 0;
  private _targetTransparency = 0;

  private _internalNeverDrawn: Id64Set = new Set<Id64String>();
  private _internalAlwaysDrawn: Id64Set = new Set<Id64String>();
  private _exclusive = false;

  public constructor(
    vp: Viewport,
    iModel: IModelConnection,
    elems: ChangedElementEntry[],
    options?: VersionDisplayOptions,
    targetIModelModels?: Set<string>,
    targetIModelCategories?: Set<string>,
    hiddenElems?: ChangedElementEntry[],
  ) {
    this.iModel = iModel;
    this.visibleChangedElems = elems;
    this.hiddenChangedElems = hiddenElems || [];
    this.viewport = vp;
    this._options = options;

    if (vp.view.is3d()) {
      this._trees = new Trees(this, targetIModelModels, targetIModelCategories);
    } else {
      const viewState = vp.view.clone(iModel) as ViewState2d;
      const model = viewState.getViewedModel();
      if (undefined !== model) {
        this._treeRef2d = new Reference(
          model.createTileTreeReference(viewState),
          this,
        );
      }
    }
    this.secondaryIModelOverrides = this.initOverrides();

    this._removals.push(
      vp.onViewportChanged.addListener((_vp, flags) => this.handleViewportChanged(flags)),
      // vp.onFeatureOverrideProviderChanged.addListener(this._onProvidersChanged),
    );

    vp.addTiledGraphicsProvider(this);
    vp.addFeatureOverrideProvider(this);
    vp.isFadeOutActive = true;

    refreshEvent.raiseEvent();
  }

  /** Variables to keep emphasized elements data */
  private _eeIsolated: Id64Set | undefined;
  private _eeHidden: Id64Set | undefined;
  private _eeEmphasized: Id64Set | undefined;

  /** Clear emphasized elements */
  public clearEmphasizedElements() {
    if (
      this._eeIsolated !== undefined &&
      this._eeHidden !== undefined &&
      this._eeEmphasized !== undefined
    ) {
      this._internalAlwaysDrawn = new Set([]);
      for (const id of this._eeHidden) {
        this._internalNeverDrawn.delete(id);
      }

      this._eeIsolated = undefined;
      this._eeEmphasized = undefined;
      this._eeHidden = undefined;
      this.updateOptions();
    }
  }

  /**
   * Way to update options of the provider to change hiding unchanged, removed, and other display options
   * @param options Display options
   */
  public updateOptions(options?: VersionDisplayOptions) {
    this._options = options;
    this.secondaryIModelOverrides = this.initOverrides();

    if (
      this._options &&
      (this._options.neverDrawn || this._internalNeverDrawn.size !== 0)
    ) {
      this._setNeverDrawn(
        this.viewport,
        this._options.neverDrawn
          ? this._options.neverDrawn
          : new Set<Id64String>(),
      );
    }

    if (this._internalAlwaysDrawn.size !== 0) {
      this._setAlwaysDrawn(this.viewport, this._internalAlwaysDrawn);
    }

    this.viewport.invalidateScene();
    this.viewport.setFeatureOverrideProviderChanged();

    refreshEvent.raiseEvent();
  }

  /**
   * Set changed element entries to visualize
   * @param elems Changed elements
   * @param hiddenElems Optional hidden changed elements to override display
   */
  public setChangedElems(elems: ChangedElementEntry[], hiddenElems: ChangedElementEntry[] | undefined) {
    this.visibleChangedElems = elems;
    this.hiddenChangedElems = hiddenElems || [];
    this.viewport.invalidateScene();
    this.viewport.setFeatureOverrideProviderChanged();
    refreshEvent.raiseEvent();
  }

  /**
   * Sets the transparency of the current and target iModel elements
   * @param current Current IModel Element's transparency (0.0 - 1.0)
   * @param target Target IModel Element's transparency (0.0 - 1.0)
   */
  public setTransparency(current: number, target: number) {
    this._currentTransparency = current;
    this._targetTransparency = target;
    this.viewport.invalidateScene();
    this.viewport.setFeatureOverrideProviderChanged();
    refreshEvent.raiseEvent();
  }

  /**
   * Clean-up
   */
  public dispose(): void {
    for (const removal of this._removals) {
      removal();
    }

    this._removals.length = 0;

    this.viewport.dropFeatureOverrideProvider(this);
    this.viewport.isFadeOutActive = false;
    this.viewport.dropTiledGraphicsProvider(this);
  }

  /**
   * Creates the Provider. This will query for deleted elmeents' models
   * @param vp Viewport
   * @param changedElements Changed element entries to display, colorize and emphasize
   * @param targetConnection Target iModel with different version
   * @param deletedElementIds Element Ids of all deleted elements that we may want to display
   * @param options Display options for hiding, etc.
   */
  public static async create(
    vp: Viewport,
    changedElements: ChangedElementEntry[],
    targetConnection: IModelConnection,
    options?: VersionDisplayOptions,
  ): Promise<Provider | undefined> {
    try {
      const data = ModelsCategoryCache.getModelsCategoryData();
      if (data === undefined) {
        throw new Error("Cannot create provider: Missing models category cache data");
      }

      // Show deleted categories in viewport
      vp.changeCategoryDisplay(data.deletedCategories, true, true);

      return new Provider(
        vp,
        targetConnection,
        changedElements,
        options,
        new Set([...data.deletedElementsModels, ...data.updatedElementsModels]),
        data.categories,
      );
    } catch (ex) {
      let error = "Unknown Error";
      if (ex instanceof Error) {
        error = ex.message;
      } else if (typeof ex === "string") {
        error = ex;
      }
      // eslint-disable-next-line no-alert
      alert(error);
      return undefined;
    }
  }

  public forEachTileTreeRef(
    _vp: Viewport,
    func: (ref: TileTreeReference) => void,
  ): void {
    if (this.wantShowRefTrees) {
      if (this._trees !== undefined) {
        this._trees.forEach(func);
      }
      if (this._treeRef2d !== undefined) {
        func(this._treeRef2d);
      }
    }
  }

  private _wantHideUnchanged() {
    return this._options && this._options.hideUnchanged;
  }

  /**
   * Returns true if the provider wants to draw reference trees of the other iModel
   */
  public get wantShowRefTrees() {
    return !this._wantHideRemoved();
  }

  private _wantHideRemoved() {
    return this._options && this._options.hideRemoved;
  }

  private _wantHideModified() {
    // Hide modified by default unless the options say modified must be shown
    return this._options && this._options.hideModified;
  }

  /**
   * The overrides applied to the *primary* IModelConnection, to hilite inserted/updated elements.
   * This also takes into account never drawn elements passed via display options to the provider
   */
  public addFeatureOverrides(overrides: FeatureSymbology.Overrides): void {
    overrides.setDefaultOverrides(
      this._wantHideUnchanged() ? hiddenAppearance : unchangedAppearance,
    );

    const insertedElems = this.visibleChangedElems.filter((entry: ChangedElement) => entry.opcode === DbOpcode.Insert);
    const updatedElems = this.visibleChangedElems.filter((entry: ChangedElement) => entry.opcode === DbOpcode.Update);

    const inserted = FeatureAppearance.fromJSON({
      rgb: VersionCompareVisualizationManager.colorInsertedRgb(),
      transparency: this._currentTransparency,
      emphasized:
        this._options !== undefined &&
          this._options.emphasized !== undefined &&
          this._options.emphasized
          ? true
          : undefined,
    });

    for (const elem of insertedElems) {
      // Check if user is emphasizing some elements, and if so, override said elements
      if (this._internalAlwaysDrawn.size === 0 || this._internalAlwaysDrawn.has(elem.id)) {
        overrides.override({ elementId: elem.id, appearance: inserted });
      }
    }

    // const updated = FeatureSymbology.Appearance.fromRgba(VersionCompareVisualizationManager.colorModified());
    const updated = FeatureAppearance.fromJSON({
      rgb: VersionCompareVisualizationManager.colorModifiedRgb(),
      transparency: this._currentTransparency,
      emphasized:
        this._options !== undefined &&
          this._options.emphasized !== undefined &&
          this._options.emphasized
          ? true
          : undefined,
    });
    const updatedIndirectly = FeatureAppearance.fromJSON({
      rgb: VersionCompareVisualizationManager.colorModifiedRgb(),
      transparency: this._currentTransparency,
      emphasized:
        this._options !== undefined &&
          this._options.emphasized !== undefined &&
          this._options.emphasized
          ? true
          : undefined,
    });
    for (const elem of updatedElems) {
      // Check if user is emphasizing some elements, and if so, only override said elements
      if (this._internalAlwaysDrawn.size === 0 || this._internalAlwaysDrawn.has(elem.id)) {
        overrides.override({
          elementId: elem.id,
          appearance: elem.indirect
              ? updatedIndirectly
              : updated,
         });
      }
    }

    for (const elem of this.hiddenChangedElems){
      // If the user has hidden elements, we have to override them with the hidden appearance
      if (this._internalAlwaysDrawn.size === 0 || this._internalAlwaysDrawn.has(elem.id)) {
        overrides.override({
          elementId: elem.id,
          appearance: hiddenAppearance,
        });
      }
    }
  }

  /** Overrides the given elements to show their tiles from the secondary iModel Connection */
  private _overrideSecondaryIModelElements = (
    ovrs: FeatureSymbology.Overrides,
    elementIds: Set<string>,
    color: RgbColorProps,
  ) => {
    // If the user has isolated elements, only draw the secondary iModel elements that are part of the always drawn set
    if (this._exclusive && this._internalAlwaysDrawn.size !== 0) {
      const deletedAlwaysDrawn = [...elementIds].filter((elemId: string) => this._internalAlwaysDrawn.has(elemId));
      ovrs.setAlwaysDrawnSet(new Set(deletedAlwaysDrawn), true, false);
    } else {
      // Draw all deleted elements
      ovrs.setAlwaysDrawnSet(elementIds, true, false); // really "only-drawn" - only draw our deleted elements - unless their subcategory is turned off.
    }

    const appearance = FeatureAppearance.fromJSON({
      rgb: color,
      transparency: this._targetTransparency,
      emphasized:
        this._options !== undefined &&
          this._options.emphasized !== undefined &&
          this._options.emphasized
          ? true
          : undefined,
    });

    // If the user emphasized elements, we have to only show in the emphasized elements
    if (this._internalAlwaysDrawn.size !== 0 && !this._exclusive) {
      ovrs.setDefaultOverrides(unchangedAppearance);
      const alwaysDrawn = [...elementIds].filter((elemId: string) => this._internalAlwaysDrawn.has(elemId));
      alwaysDrawn.forEach((elementId) => {
        ovrs.override({ elementId, appearance });
      });
    } else {
      // If not emphasizing, just set the elements in the other iModel to show as the given appearance
      elementIds.forEach((elementId) => {
        ovrs.override({ elementId, appearance });
      });
    }
  };

  /** The overrides applied to the tiles from the *secondary* IModelConnection, to draw only deleted elements. */
  private initOverrides(): FeatureSymbology.Overrides {
    const ovrs = new FeatureSymbology.Overrides(this.viewport);
    const neverDrawn =
      this._options && this._options.neverDrawn
        ? this._options.neverDrawn
        : new Set<string>([]);

    ovrs.neverDrawn.clear();
    ovrs.alwaysDrawn.clear();

    const hiddenDeletedElements =
      this._options?.hiddenDeletedElements ?? new Set<string>();

    // Handle removed elements that are in secondary iModel
    if (!this._wantHideRemoved()) {
      const deletedElemIds = new Set(
        this.visibleChangedElems
          .filter(
            (entry: ChangedElement) =>
              entry.opcode === DbOpcode.Delete &&
              !neverDrawn.has(entry.id) &&
              !hiddenDeletedElements.has(entry.id),
          )
          .map((entry: ChangedElement) => entry.id),
      );
      // Set override for the deleted element ids with the given color
      this._overrideSecondaryIModelElements(
        ovrs,
        deletedElemIds,
        VersionCompareVisualizationManager.colorDeletedRgb(),
      );
    }

    // Handle modified elements that are in secondary iModel
    if (this._options?.wantModified && !this._wantHideModified()) {
      const modifiedElemIds = new Set(
        this.visibleChangedElems
          .filter(
            (entry: ChangedElement) =>
              entry.opcode === DbOpcode.Update && !neverDrawn.has(entry.id),
          )
          .map((entry: ChangedElement) => entry.id),
      );
      // Set override for the modified element ids with the given color
      this._overrideSecondaryIModelElements(
        ovrs,
        modifiedElemIds,
        VersionCompareVisualizationManager.colorModifiedTargetRgb(),
      );
    }

    return ovrs;
  }

  /**
   * Handle viewport changed messages
   * @param flags ChangeFlags
   */
  private handleViewportChanged(flags: ChangeFlags): void {
    if (flags.viewState && !this.viewport.view.isSpatialView()) {
      // Switched to a 2d view. Terminate version comparison.
      this.dispose();
      return;
    }

    if (flags.areFeatureOverridesDirty) {
      this.secondaryIModelOverrides = this.initOverrides();
      this.viewport.invalidateScene();
    }

    if (flags.viewedModels) {
      if (this._trees) {
        this._trees.markDirty();
      }
      this.viewport.invalidateScene();

      const models = this.viewport.view.is2d()
        ? new Set([this.viewport.view.baseModelId])
        : (this.viewport.view as SpatialViewState).modelSelector.models;
      const unloaded = this.iModel.models.filterLoaded(models);
      if (undefined === unloaded) {
        return;
      }

      this.iModel.models
        .load(unloaded)
        .then(() => {
          if (this._trees) {
            this._trees.markDirty();
          }
          this.viewport.invalidateScene();
        })
        .catch(() => {
          /* No-op */
        });
    }
  }

  /**
   * Returns the version compare feature override provider or undefined if not found
   * @param vp Viewport to get the provider from
   */
  public static get(vp: Viewport): Provider | undefined {
    return vp.findFeatureOverrideProviderOfType(Provider);
  }

  /** @internal */
  protected updateIdSet(ids: Id64Arg, existingIds?: Id64Set): Id64Set {
    const newIds = new Set<string>();
    Id64.toIdSet(ids).forEach((id) => {
      newIds.add(id);
    });
    if (existingIds) {
      existingIds.forEach((id) => newIds.add(id));
    }

    return newIds;
  }

  /**
   * Sets the never drawn elements internally and maintains any version compare related never drawn elements
   * @param vp Viewport to set never drawn on
   * @param ids Ids to add
   */
  private _setNeverDrawn(vp: Viewport, ids: Id64Arg): void {
    const allIds = this.updateIdSet(ids, this._internalNeverDrawn);
    if (allIds) {
      vp.setNeverDrawn(allIds);
    }
  }

  /**
   * Sets the never drawn elements internally and maintains any version compare related never drawn elements
   * @param vp Viewport to set never drawn on
   * @param ids Ids to add
   */
  private _setAlwaysDrawn(vp: Viewport, ids: Id64Arg): void {
    const allIds = this.updateIdSet(ids, this._internalAlwaysDrawn);
    if (allIds) {
      vp.setAlwaysDrawn(allIds, this._exclusive);
    }
  }

  /**
   * Hide elements
   * @param ids Ids of elements to hide
   * @param replace Replace ids or maintain the internal never drawn
   */
  public hideElements(ids: Id64Arg, replace = false): boolean {
    if (replace) {
      this._internalNeverDrawn = Id64.toIdSet(ids);
    }

    const updatedIds = this.updateIdSet(ids, this._internalNeverDrawn);
    if (updatedIds) {
      this._internalNeverDrawn = updatedIds;
      // Update using same options to re-create the overrides
      this.updateOptions(this._options);
      return true;
    }

    return false;
  }

  /**
   * Hides selected elements in the bound viewport
   * @param replace Replace the never drawn elements
   * @param clearSelection Clear selection after hide
   */
  public hideSelectedElements(replace = false, clearSelection = true): boolean {
    const selection = this.viewport.view.iModel.selectionSet;
    if (
      !selection.isActive ||
      !this.hideElements(selection.elements, replace)
    ) {
      return false;
    }
    if (clearSelection) {
      selection.emptyAll();
    }
    return true;
  }

  /**
   * Hide elements
   * @param ids Ids of elements to hide
   * @param replace Replace ids or maintain the internal never drawn
   */
  public emphasizeElements(ids: Id64Arg, replace = true): boolean {
    if (replace) {
      this._internalAlwaysDrawn = Id64.toIdSet(ids);
    }

    const updatedIds = this.updateIdSet(ids, this._internalAlwaysDrawn);
    if (updatedIds) {
      this._internalAlwaysDrawn = updatedIds;
      this._exclusive = false;
      // Update using same options to re-create the overrides
      this.updateOptions(this._options);
      return true;
    }

    return false;
  }

  /**
   * Emphasizes elements in comparison
   * @param replace Replace always drawn list
   * @param clearSelection Clear the selection after running command
   */
  public emphasizeSelectedElements(replace = true, clearSelection = true) {
    const selection = this.viewport.view.iModel.selectionSet;
    if (
      !selection.isActive ||
      !this.emphasizeElements(selection.elements, replace)
    ) {
      return false;
    }
    if (clearSelection) {
      selection.emptyAll();
    }
    return true;
  }

  /**
   * Isolates elements in the view
   * @param ids Ids of elements to isolate
   * @param replace Whether to replace always drawn
   */
  public isolateElements(ids: Id64Arg, replace = true): boolean {
    if (replace) {
      this._internalAlwaysDrawn = Id64.toIdSet(ids);
    }

    const updatedIds = this.updateIdSet(ids, this._internalAlwaysDrawn);
    if (updatedIds) {
      this._internalAlwaysDrawn = updatedIds;
      this._exclusive = true;
      // Update using same options to re-create the overrides
      this.updateOptions(this._options);
      return true;
    }

    return false;
  }

  /**
   * Isolate selected elements in the view
   * @param replace Replace all isolated elements
   * @param clearSelection Clear selection after command
   */
  public isolateSelectedElements(replace = true, clearSelection = true) {
    const selection = this.viewport.view.iModel.selectionSet;
    if (
      !selection.isActive ||
      !this.isolateElements(selection.elements, replace)
    ) {
      return false;
    }
    if (clearSelection) {
      selection.emptyAll();
    }
    return true;
  }

  /**
   * Clear emphasize/isolate/hide
   */
  public clear() {
    this._internalNeverDrawn = new Set<Id64String>();
    this._internalAlwaysDrawn = new Set<Id64String>();
    this._exclusive = false;

    this.viewport.clearAlwaysDrawn();
    this.viewport.clearNeverDrawn();

    this.updateOptions(this._options);
  }

  /** Get never drawn without the internal never drawn */
  public getNeverDrawn(): Set<string> {
    const neverDrawn = this.viewport.neverDrawn;
    if (!neverDrawn) {
      return new Set<string>();
    }

    const array = [...neverDrawn].filter((id: string) => !this._internalNeverDrawn.has(id));
    return new Set(array);
  }

  public getExclusiveAlwaysDrawn(): Set<string> {
    if (!this._exclusive) {
      return new Set<string>([]);
    }

    return this._internalAlwaysDrawn;
  }

  public isEmphasizingHidingOrIsolating() {
    return (
      this._internalAlwaysDrawn.size !== 0 ||
      this._internalNeverDrawn.size !== 0
    );
  }

  public toJSON(): ProviderProps {
    return {
      changedElems: this.visibleChangedElems,
      options: this._options,
      internalAlwaysDrawn: this._internalAlwaysDrawn,
      internalNeverDrawn: this._internalNeverDrawn,
      exclusive: this._exclusive,
    };
  }

  public toEmphasizeElementsProps(): EmphasizeElementsProps {
    return {
      neverDrawn: Array.from(this._internalNeverDrawn.values()),
      alwaysDrawn: Array.from(this._internalAlwaysDrawn.values()),
      isAlwaysDrawnExclusive: this._exclusive,
    };
  }

  public fromJSON(props: ProviderProps) {
    this.visibleChangedElems = props.changedElems;
    this._internalAlwaysDrawn = props.internalAlwaysDrawn;
    this._internalNeverDrawn = props.internalNeverDrawn;
    this._exclusive = props.exclusive;
    this._options = props.options;
    this.updateOptions(this._options);
  }
}

/** A proxy reference to a TileTreeReference originating from the secondary IModelConnection. */
class Reference extends TileTreeReference {
  private readonly _ref: TileTreeReference;
  private readonly _provider: Provider;

  public constructor(ref: TileTreeReference, provider: Provider) {
    super();
    this._ref = ref;
    this._provider = provider;
  }

  public get treeOwner() {
    return this._ref.treeOwner;
  }
  public override get castsShadows() {
    return false;
  }

  protected override getSymbologyOverrides() {
    return this._provider.secondaryIModelOverrides;
  }
}

/** Enables displaying tiles from a different iModel to show deleted/inserted elements during version comparison
 *
 * Interactivity with the deleted elements includes:
 *  - Flashing: should flash and show a tooltip.
 *  - Selection: should hilite, and if we had properties, should show correct properties.
 *  - Measure tool: should be able to snap to deleted elements and "normal" elements.
 *  - Toggling model/category display: should synchronize with the Viewport's model/category selectors.
 *  - ViewFlags: render mode, constructions, edge display, etc should be defined by the Viewport.
 *  - Never/always-drawn elements? Possiby will need to synchronize with Viewport.
 * @param vp Viewport to use for displaying change
 * @param targetConnection IModelConnection to the target iModel version
 * @param focusedChangedElements Changed elements to be colorized and emphasized
 * @param allChangedElements all changed elements found during version comparison
 * @param options [optional] VersionDisplayOptions for display hiding/emphasizing/isolating
 */
export async function enableVersionComparisonDisplay(
  vp: Viewport,
  targetConnection: IModelConnection,
  focusedChangedElements: ChangedElementEntry[],
  _allChangedElements: ChangedElementEntry[],
  options?: VersionDisplayOptions,
): Promise<void> {
  if (isVersionComparisonDisplayEnabled(vp)) {
    await disableVersionComparisonDisplay(vp);
  }

  const provider = await Provider.create(
    vp,
    focusedChangedElements,
    targetConnection,
    options,
  );

  // Load cached provider props to recover from frontstages
  if (provider && useCachedProviderProps && cachedProviderProps) {
    provider.fromJSON(cachedProviderProps);
    // We have used the cache, destroy it
    cachedProviderProps = undefined;
  }

  // Maintain per-model categories
  if (provider && cachedPerModelCategoryProps) {
    cachedPerModelCategoryProps.forEach(
      (prop: PerModelCategoryVisibilityProps) => {
        vp.perModelCategoryVisibility.setOverride(
          prop.modelId,
          prop.categoryId,
          prop.visible
            ? PerModelCategoryVisibility.Override.Show
            : PerModelCategoryVisibility.Override.Hide,
        );
      },
    );
  }
}

/** Returns true if version comparison is currently activated for the specified viewport. */
export function isVersionComparisonDisplayEnabled(vp: Viewport): boolean {
  return undefined !== vp.findFeatureOverrideProviderOfType(Provider);
}

/** Turn off version comparison if it is enabled. */
export async function disableVersionComparisonDisplay(vp: Viewport): Promise<void> {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    cachedProviderProps = undefined;
    cachedPerModelCategoryProps = undefined;
    existing.dispose();
    // BF: #173681: Clear the always/never drawn
    vp.clearAlwaysDrawn();
    vp.clearNeverDrawn();
  }
}

/** Update display options */
export async function updateVersionComparisonDisplayOptions(
  vp: Viewport,
  options?: VersionDisplayOptions,
) {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    existing.updateOptions(options);
  }
}

/** Sets the transparency for each iModel's changed elements */
export function updateVersionComparisonTransparencies(
  vp: Viewport,
  currentTransparency: number,
  targetTransparency: number,
) {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing) {
    existing.setTransparency(currentTransparency, targetTransparency);
  }
}

export function cacheVersionComparisonDisplayProvider(vp: Viewport): void {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (
    useCachedProviderProps &&
    undefined !== existing &&
    existing instanceof Provider
  ) {
    cachedProviderProps = existing.toJSON();
    cachedPerModelCategoryProps = [];
    for (const override of vp.perModelCategoryVisibility) {
      cachedPerModelCategoryProps.push({
        modelId: override.modelId,
        categoryId: override.categoryId,
        visible: override.visible,
      });
    }
  }
}

export function cleanupCachedVersionComparisonDisplayProvider(): void {
  cachedProviderProps = undefined;
  cachedPerModelCategoryProps = undefined;
}

export function isVersionComparisonDisplayUsingContextTools(vp: Viewport): boolean {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    return existing.isEmphasizingHidingOrIsolating();
  }

  return false;
}

export function updateVersionCompareDisplayEntries(
  vp: Viewport,
  visibleEntries: ChangedElementEntry[],
  hiddenEntries: ChangedElementEntry[] | undefined,
): boolean {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    existing.setChangedElems(visibleEntries, hiddenEntries);
    return true;
  }

  return false;
}

export function getVersionComparisonNeverDrawn(vp: Viewport): Set<string> {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    return existing.getNeverDrawn();
  }
  return new Set<string>();
}

export function isolateVersionCompare(vp: Viewport, ids: Id64Arg): void {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    existing.isolateElements(ids, true);
  }
}

export function clearEmphasizedVersionCompare(vp: Viewport): void {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    existing.clearEmphasizedElements();
  }
}

export function getVersionComparisonAlwaysDrawn(vp: Viewport): Set<string> {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    return existing.getExclusiveAlwaysDrawn();
  }
  return new Set<string>();
}

/**
 * Enables caching version compare visualization state so that we can maintain the view state
 * when coming from property comparison frontstage and others
 * @param value Whether to cache or not
 */
export function enableVersionCompareVisualizationCaching(value: boolean): void {
  useCachedProviderProps = value;
}

export function getEmphasizeElementsProps(vp: Viewport): EmphasizeElementsProps | undefined {
  const existing = vp.findFeatureOverrideProviderOfType(Provider);
  if (undefined !== existing && existing instanceof Provider) {
    return existing.isEmphasizingHidingOrIsolating()
      ? existing.toEmphasizeElementsProps()
      : undefined;
  }
  return undefined;
}

export function attachToRefreshEvents(callback: () => void) {
  refreshEvent.addListener(callback);
}

export function dettachFromRefreshEvents(callback: () => void) {
  refreshEvent.removeListener(callback);
}

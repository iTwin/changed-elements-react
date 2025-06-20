/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, DbOpcode, type Id64String } from "@itwin/core-bentley";
import { ColorDef, EmphasizeElementsProps, Placement3d, RgbColor, type ElementProps, type GeometricElement3dProps } from "@itwin/core-common";
import {
  EmphasizeElements, GeometricModelState, IModelApp, IModelConnection, MarginPercent, ScreenViewport, SpatialViewState, ViewState3d } from "@itwin/core-frontend";
import { Range3d, Transform } from "@itwin/core-geometry";
import { KeySet } from "@itwin/presentation-common";
import { HiliteSetProvider } from "@itwin/presentation-frontend";

import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "./VerboseMessages.js";
import {
  cacheVersionComparisonDisplayProvider, disableVersionComparisonDisplay, enableVersionComparisonDisplay,
  getVersionComparisonAlwaysDrawn, getVersionComparisonNeverDrawn,
  isVersionComparisonDisplayEnabled, Provider as VersionCompareProvider, updateVersionCompareDisplayEntries,
  updateVersionComparisonDisplayOptions, type VersionDisplayOptions
} from "./VersionCompareTiles.js";
import { FilterOptions } from "../SavedFiltersManager.js";

/**
 * Handles version compare visualization by using the VersionCompareTiles' provider
 * It will display compariosn by coloring the view and utilize tiles from the
 * target iModel to display elements that are not in the current version of the iModel
 * This is useful for removed elements that no longer exist in the current version
 */
export class VersionCompareVisualizationManager {
  public static colorDeleted() {
    return ColorDef.create("rgb(204,0,0)");
  }
  public static colorDeletedRgb() {
    return new RgbColor(204, 0, 0);
  }
  public static colorInserted() {
    return ColorDef.create("rgb(86,170,28)");
  }
  public static colorInsertedRgb() {
    return new RgbColor(86, 170, 28);
  }
  public static colorModified() {
    return ColorDef.create("rgb(0,139,225)");
  }
  public static colorModifiedRgb() {
    return new RgbColor(0, 139, 225);
  }
  public static colorModifiedTargetRgb() {
    return new RgbColor(0, 200, 225);
  }
  public static colorBackground() {
    return ColorDef.create("rgba(228,228,228,10)");
  }

  public displayOptions: VersionDisplayOptions;

  private _currentHiliteSetProvider: HiliteSetProvider;
  private _targetHiliteSetProvider: HiliteSetProvider;
  private _focusedElements: ChangedElementEntry[] | undefined;

  private _modelsAtStart: string[] = [];
  private _originalEmphasizeElementsProps: EmphasizeElementsProps | undefined;

  /**
   * Constructor for visualization manager
   * @param _targetIModel Target IModelConnection of the version we are comparing against
   * @param _changedElements Changed Element Entries for the comparison visualization
   * @param _viewport Viewport in which we are attaching the visualization
   * @param _changedModels Set of changed model Ids, used to optimize visualizing change
   * @param _unchangedModels Set of unchanged model Ids, used to optimize visualizing change
   * @param _onViewChanged onViewChanged event used to let the visualization manager know whenever there are view attribute changes
   * @param _wantSecondaryModified Whether to show modified elements from the secondary iModel Connection
   */
  constructor(
    private _targetIModel: IModelConnection,
    private _changedElements: ChangedElementEntry[],
    private _viewport: ScreenViewport,
    private _changedModels?: Set<string>,
    private _unchangedModels?: Set<string>,
    private _onViewChanged?: BeEvent<(args: unknown) => void>,
    _wantSecondaryModified?: boolean,
  ) {
    if (_onViewChanged !== undefined) {
      _onViewChanged.addListener(this.onViewChangedHandler);
    }
    this.displayOptions = {
      hideUnchanged: false,
      hideRemoved: false,
      hideModified: false,
      hideAdded: false,
      wantModified: _wantSecondaryModified,
      emphasized: true,
    };
    this._currentHiliteSetProvider = HiliteSetProvider.create({
      imodel: this._viewport.iModel,
    });
    this._targetHiliteSetProvider = HiliteSetProvider.create({
      imodel: this._targetIModel,
    });
    this._viewport.view.forEachModel((model: GeometricModelState) => {
      this._modelsAtStart.push(model.id);
    });
  }

  public updateDisplayOptions = (options: FilterOptions) => {
    if (options.wantAdded !== undefined) {
      this.displayOptions.hideAdded = !options.wantAdded;
    }

    if (options.wantModified !== undefined) {
      this.displayOptions.hideModified = !options.wantModified;
    }

    this.displayOptions.hideUnchanged =
      options.wantUnchanged !== undefined ? !options.wantUnchanged  : !this.displayOptions.hideUnchanged;
  }

  /**
   * Used to emphasize and focus on a list of elements instead of all changed elements in comparison
   * @param elements Elements to focus during visualization
   */
  public setFocusedElements = async (elements: ChangedElementEntry[] | undefined) => {
    this._focusedElements = elements;
    updateVersionCompareDisplayEntries(
      this._viewport,
      this._focusedElements !== undefined
        ? this._focusedElements
        : this._changedElements,
    );
  };

  /** Gets the elements currently being visualized */
  public getFocusedElements = () => {
    return this._focusedElements;
  };

  /**
   * Attaches the manager to a given viewport and starts the visualization of the comparison
   * @param viewport Viewport to do visualization on
   */
  public async attachToViewport(viewport: ScreenViewport) {
    this._viewport = viewport;

    const ee = EmphasizeElements.get(viewport);
    const currentJson = ee?.toJSON(viewport);
    // store current emphasize elements
    this._originalEmphasizeElementsProps = currentJson;
    // clear emphasize elements
    EmphasizeElements.clear(viewport);
    // Set version compare provider display
    await this.resetDisplay();
    const vpp = VersionCompareProvider.get(viewport);
    if (!vpp) {
      return;
    }
  }

  /** Cleans up by removing listeners and clearing the comparison visualization and reapply previous EE */
  public async cleanUp() {
    if (this._onViewChanged) {
      this._onViewChanged.removeListener(this.onViewChangedHandler);
    }

    this.displayOptions = {
      hideUnchanged: false,
      hideRemoved: false,
      hideModified: false,
      hideAdded: false,
    };

    await disableVersionComparisonDisplay(this._viewport);

    // Maintain whatever hide/isolate/emphasize props that we may have done during comparison (or before comparison)
    if (this._originalEmphasizeElementsProps) {
      const ee = EmphasizeElements.getOrCreate(this._viewport);
      ee.fromJSON(this._originalEmphasizeElementsProps, this._viewport);
      ee.wantEmphasis = true;
    }

    // Revert models to what they were when comparison started
    await this._viewport.addViewedModels(this._modelsAtStart);
  }

  /** React to refreshing widgets. This is triggered by saved views and other widgets. Make sure we always maintain coloring */
  public onViewChangedHandler = async () => {
    await this.resetDisplay();
  };

  /** Gets a color based on the opcode of a change */
  public static getColor(opcode: DbOpcode) {
    switch (opcode) {
      case DbOpcode.Insert:
        return this.colorInserted();
      case DbOpcode.Delete:
        return this.colorDeleted();
      case DbOpcode.Update:
        return this.colorModified();
      default:
        return this.colorBackground();
    }
  }

  /** Zooms to the given model */
  public async zoomToModel(modelId: string, turnOn?: boolean): Promise<void> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp) {
      return;
    }

    // Turn on model being inspected
    if (turnOn) {
      await vp.addViewedModels(modelId);
    }

    // Zoom to the range of the model
    const range = await vp.iModel.models.queryModelRanges(modelId);
    const view = vp.view;
    if (range.length === 1) {
      const viewRange = Range3d.fromJSON(range[0]);
      const viewRotation = view.getRotation();
      const viewTransform = Transform.createOriginAndMatrix(
        undefined,
        viewRotation,
      );
      viewTransform.multiplyRange(viewRange, viewRange);
      view.lookAtViewAlignedVolume(viewRange, vp.viewRect.aspect);
      vp.synchWithView();
    }
  }

  /** Turn on changed models */
  public async showChangedModels() {
    if (this.displayOptions.changedModels) {
      await this._viewport.addViewedModels(this.displayOptions.changedModels);
      this._viewport.invalidateScene();
    }
  }

  /** Returns true if any of the elements passed are NOT in the hidden deleted element set */
  private _anyDeletedElementVisible = (entries: ChangedElementEntry[]): boolean => {
    const hiddenDeletedElements =
      this.displayOptions.hiddenDeletedElements ?? new Set<string>();
    for (const entry of entries) {
      if (!hiddenDeletedElements.has(entry.id)) {
        return true;
      }
    }
    return false;
  };

  /** Check if a model is visible */
  public isModelVisibile(id: string, isDeleted: boolean): boolean {
    if (isDeleted) {
      const modelEntries = this._getEntriesWithModel(id);
      return this._anyDeletedElementVisible(modelEntries);
    }

    return this._viewport.viewsModel(id);
  }

  /** Get entries with the given model Id */
  private _getEntriesWithModel = (modelId: string) => {
    const entries: ChangedElementEntry[] = [];
    for (const elem of this._changedElements) {
      if (elem.modelId === modelId) {
        entries.push(elem);
      }
    }
    return entries;
  };

  /** Toggles visibility of the deleted elements with the given model id */
  private _toggleDeletedModelElements = async (modelId: string) => {
    const modelEntries: ChangedElementEntry[] =
      this._getEntriesWithModel(modelId);
    const hiddenDeletedElements =
      this.displayOptions.hiddenDeletedElements ?? new Set<string>();
    // Toggle the visibility by deleting/adding the found/not-found ids
    for (const entry of modelEntries) {
      if (hiddenDeletedElements.has(entry.id)) {
        hiddenDeletedElements.delete(entry.id);
      } else {
        hiddenDeletedElements.add(entry.id);
      }
    }
    this.displayOptions.hiddenDeletedElements = hiddenDeletedElements;
    // Reset display to update options
    await this.resetDisplay();
  };

  public async toggleModel(id: string) {
    await this._toggleDeletedModelElements(id);

    if (this._viewport.viewsModel(id)) {
      this._viewport.changeModelDisplay(id, false);
    } else {
      await this._viewport.addViewedModels(id);
    }

    this._viewport.invalidateScene();
  }

  /** Toggles the visibility of unchanged elements during comparison */
  public async toggleUnchangedVisibility(): Promise<boolean> {
    this.displayOptions.changedModels = this._changedModels;
    this.displayOptions.emphasized = true;

    const vp = IModelApp.viewManager.selectedView;
    if (!vp) {
      return false;
    }

    // Drop models that are unchanged in 3D views
    const unchanged = this._unchangedModels;
    if (unchanged && vp.view.is3d()) {
      const spatialView = (vp.view as SpatialViewState).clone();
      if (this.displayOptions.hideUnchanged) {
        spatialView.modelSelector.dropModels(unchanged);
      } else {
        spatialView.modelSelector.addModels(unchanged);
      }
      vp.changeView(spatialView);
    }

    await this.resetDisplay();
    return this.displayOptions.hideUnchanged;
  }

  /**
   * Finds the range of the given elements
   * If the range is too small for the viewport to visualize, it adjusts it before returning
   * @param iModel IModel to query
   * @param viewState View State to adjust for
   * @param ids Element Ids
   * @returns
   */
  private async _findElementsVolume(
    iModel: IModelConnection,
    viewState: ViewState3d,
    ids: string[],
  ): Promise<Range3d | undefined> {
    const props: ElementProps[] = await iModel.elements.getProps(ids);
    if (props.length === 0) {
      return undefined;
    }

    const finalRange = Range3d.create();
    for (const prop of props) {
      const placement = (prop as GeometricElement3dProps).placement;
      if (placement) {
        finalRange.extendRange(Placement3d.fromJSON(placement).calculateRange());
      }
    }

    // Ensure that if we have a range that is too small, we fix it up to be the minimum front distance + 10% of its size
    finalRange.ensureMinLengths(viewState.minimumFrontDistance() * 1.1);
    return finalRange;
  }

  /** Resets and updates the visualization by using the display options provided */
  public async resetDisplay(force?: boolean) {
    if (!this._targetIModel || !this._viewport) {
      return;
    }

    // Update or enable
    if (
      (force === undefined || force === false) &&
      isVersionComparisonDisplayEnabled(this._viewport)
    ) {
      await updateVersionComparisonDisplayOptions(
        this._viewport,
        this.displayOptions,
      );
    } else {
      const focusedElements = this._focusedElements
        ? this._focusedElements
        : this._changedElements;
      await enableVersionComparisonDisplay(
        this._viewport,
        this._targetIModel,
        focusedElements,
        this._changedElements,
        this.displayOptions,
      );
    }
  }

  private _getNeverDrawn() {
    const vp = IModelApp.viewManager.getFirstOpenView();
    if (!vp || !vp.neverDrawn) {
      return new Set<Id64String>([]);
    }

    return getVersionComparisonNeverDrawn(vp);
  }

  private _getExclusiveAlwaysDrawn() {
    const vp = IModelApp.viewManager.getFirstOpenView();
    if (!vp || !vp.alwaysDrawn) {
      return new Set<Id64String>([]);
    }

    return getVersionComparisonAlwaysDrawn(vp);
  }

  private _getViewportNeverDrawn(): Set<string> {
    const vp = IModelApp.viewManager.getFirstOpenView();
    if (!vp || !vp.neverDrawn) {
      return new Set<Id64String>([]);
    }
    return vp.neverDrawn;
  }

  /** Get never drawn list of elements that relate only to comparison */
  public getNeverDrawn() {
    const neverDrawn = this._getNeverDrawn();
    const idSet = new Set(
      this._changedElements.map((entry: ChangedElementEntry) => entry.id),
    );
    const comparedNeverDrawn = [...neverDrawn].filter((elementId: string) => {
      return idSet.has(elementId);
    });
    return new Set<Id64String>(comparedNeverDrawn);
  }

  /**
   * Toggles changed element element visibility
   * @param visible Whether to show or hide the element
   * @param elementId The element Id of the changed element
   */
  public async toggleElementVisibility(visible: boolean, elementId: string) {
    const currentNeverDrawn = this._getNeverDrawn();
    if (visible) {
      currentNeverDrawn.delete(elementId);
    } else {
      currentNeverDrawn.add(elementId);
    }

    this.displayOptions.neverDrawn = currentNeverDrawn;
    await this.resetDisplay();
  }

  /**
   * Takes elements off the never drawn list
   * @param elementIds Set of element Ids to take off the never drawn list
   */
  public async showElements(elementIds: Set<Id64String>) {
    let currentNeverDrawn = this._getNeverDrawn();
    currentNeverDrawn = new Set(
      [...currentNeverDrawn].filter((id: string) => !elementIds.has(id)),
    );
    this.displayOptions.neverDrawn = currentNeverDrawn;
    this.displayOptions.hideRemoved = false;
    this.displayOptions.hideModified = false;
    await this.resetDisplay();
  }

  /**
   * Sets the hidden elements
   * @param elementIds Set of element Ids to hide
   */
  public async setHiddenElements(elementIds: Set<Id64String>) {
    let currentNeverDrawn = this._getNeverDrawn();
    currentNeverDrawn = new Set<Id64String>([
      ...currentNeverDrawn,
      ...elementIds,
    ]);
    this.displayOptions.neverDrawn = currentNeverDrawn;
    await this.resetDisplay();
  }

  /**
   * Used to handle visibility of element sets by adding/taking off never drawn list
   * @param visible Whether to show or hide the elements
   * @param elementIds Set of element ids
   * @param wantHideRemoved Whether removed elements should be hidden
   * @param wantHideModified Whether modified elements should be hidden
   */
  public async toggleElementsVisibility(
    visible: boolean,
    elementIds: Set<Id64String>,
    wantHideRemoved?: boolean,
    wantHideModified?: boolean,
  ) {
    let currentNeverDrawn = this._getNeverDrawn();
    if (visible) {
      currentNeverDrawn = new Set([...currentNeverDrawn].filter((value: string) => !elementIds.has(value)));
    } else {
      currentNeverDrawn = new Set([...currentNeverDrawn, ...elementIds]);
    }

    if (wantHideRemoved !== undefined) {
      this.displayOptions.hideRemoved = wantHideRemoved;
    }

    if (wantHideModified !== undefined) {
      this.displayOptions.hideModified = wantHideModified;
    }

    this.displayOptions.neverDrawn = currentNeverDrawn;
    await this.resetDisplay();
  }

  /**
   * Toggles hiding/showing all elements of a certain type
   * @param visible Whether to show or hide the elements
   * @param elementIds Element Ids to use
   * @param opcode OpCode of elements
   */
  public async toggleChangeTypeVisibility(
    visible: boolean,
    elementIds: Set<Id64String>,
    opcode: DbOpcode,
  ) {
    // Reset display to show/hide deletes
    if (opcode === DbOpcode.Delete) {
      this.displayOptions.hideRemoved = !visible;
    }
    if (opcode === DbOpcode.Update) {
      this.displayOptions.hideModified = !visible;
    }

    await this.toggleElementsVisibility(visible, elementIds);
  }

  /**
   * Check if a set is contained in the hidden elements
   * @param elementIds Set of element Ids
   */
  public allHidden(elementIds: Set<Id64String>) {
    const currentNeverDrawn = this._getViewportNeverDrawn();
    for (const id of elementIds) {
      if (!currentNeverDrawn.has(id)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if any of the element Ids is visible
   * @param elementIds Set of element Ids
   */
  public isAnyVisible(elementIds: Set<Id64String>) {
    return !this.allHidden(elementIds);
  }

  /** Caches and stores hide/emphasize/isolate information to be restored later on */
  public cacheComparisonDisplay() {
    cacheVersionComparisonDisplayProvider(this._viewport);
  }

  /**
   * Check if the element Id is visible at the moment by looking at the never drawn and always drawn list
   * @param elementId Element Id to check
   */
  public isVisible(elementId: string): boolean {
    if (this._getViewportNeverDrawn().has(elementId)) {
      return false;
    }

    if (this._getNeverDrawn().has(elementId)) {
      return false;
    }

    const exclusiveAlwaysDrawn = this._getExclusiveAlwaysDrawn();
    if (
      exclusiveAlwaysDrawn.size !== 0 &&
      !exclusiveAlwaysDrawn.has(elementId)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Zooms to an entry whose element exists in the given iModel
   * @param iModel IModel to query volumes for
   * @param entry entry to zoom to
   */
  private _zoomToEntry = async (
    iModel: IModelConnection,
    entry: ChangedElementEntry,
  ): Promise<void> => {
    // Get the viewport
    const viewport = IModelApp.viewManager.selectedView;
    if (viewport === undefined) {
      return;
    }

    // Get the 3d view state to adjust for
    const viewState: ViewState3d = viewport.view as ViewState3d;
    // Element ids of the entry and children
    const elementIds = [entry.id];
    if (entry.children) {
      elementIds.push(...entry.children);
    }
    // Find the range of the combined elements
    const range = await this._findElementsVolume(iModel, viewState, elementIds);
    if (range === undefined) {
      return;
    }
    // Do zoom operation with a 10% margin
    viewport.view.lookAtVolume(range, viewport.viewRect.aspect, {
      marginPercent: new MarginPercent(0.1, 0.1, 0.1, 0.1),
    });
    viewport.synchWithView();
  };

  /** Handles zooming to element and selecting elements */
  public zoomToEntry = async (entry: ChangedElementEntry) => {
    const currentIModel = this._viewport.iModel;
    const targetIModel = this._targetIModel;
    await this._zoomToEntry(
      entry.opcode === DbOpcode.Delete ? targetIModel : currentIModel,
      entry,
    );

    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.changedElementsTreeElementClicked);
  };

  /** Handles toggling the visibility for a bunch of entries and their children - ONLY WORKS WHEN USING ASSEMBLY FILTERING */
  public toggleChangedElementsVisibility = async (
    visible: boolean,
    entries: ChangedElementEntry[],
  ) => {
    const allElementIds = entries
      .map((entry: ChangedElementEntry): string[] => {
        return entry.children !== undefined
          ? [...entry.children, entry.id]
          : [entry.id];
      })
      .reduce((a: string[], b: string[]) => {
        return a.concat(b);
      });
    if (allElementIds.length !== 0) {
      await this.toggleElementsVisibility(visible, new Set(allElementIds));
    }
  };

  /** Handles toggling visibility correctly for a changed element (including removed elements) */
  public toggleChangedElementVisibility = async (
    visible: boolean,
    entry: ChangedElementEntry,
  ) => {
    const keySet = new KeySet([
      {
        id: entry.id,
        className: "BisCore:GeometricElement",
      },
    ]);

    const hiliteSetProvider =
      entry.opcode === DbOpcode.Delete
        ? this._targetHiliteSetProvider
        : this._currentHiliteSetProvider;

    const hiliteSet = await hiliteSetProvider.getHiliteSet(keySet);
    if (hiliteSet && hiliteSet.elements) {
      await this.toggleElementsVisibility(
        visible,
        new Set([entry.id, ...hiliteSet.elements]),
      );
    }
  };

  /** Handles toggling visibility correctly for a changed element (including removed elements) */
  public toggleUnchangedElementVisibility = async (
    visible: boolean,
    id: string,
  ) => {
    const keySet = new KeySet([
      {
        id,
        className: "BisCore:GeometricElement",
      },
    ]);

    const hiliteSet = await this._currentHiliteSetProvider.getHiliteSet(keySet);
    if (hiliteSet && hiliteSet.elements) {
      await this.toggleElementsVisibility(
        visible,
        new Set([id, ...hiliteSet.elements]),
      );
    }
  };

  /**
   * Creates an array of changed elements that are the hilite set of the given element
   * and makes those entries have the same colorization (e.g. same opcode) than the entry passed
   * Needed to colorize the view based on our current inspection scope (e.g. if we are looking
   * at a birds-eye view that shows us assemblies that were modified, we want to see all the assembly,
   * including the children, as modified (blue), however, child elements may actually be unchanged or
   * have different change states (added, modified))
   */
  public manufactureChildEntriesForVisualization = (
    entry: ChangedElementEntry,
    opcode: DbOpcode,
    deletedElementIds: Set<string>,
    changedElementIds: Set<string>,
    inheritOpcode?: boolean,
  ): ChangedElementEntry[] => {
    if (entry.children === undefined) {
      return [];
    }

    const mapInherited = (id: string) => {
      return {
        id,
        classId: "",
        opcode,
        type: entry.type,
        loaded: false,
        indirect: changedElementIds.has(id) ? undefined : true,
      };
    };

    const mapWithOpcode = (id: string) => {
      const found = this._changedElements.find((cee: ChangedElementEntry) => {
        return id === cee.id;
      });
      if (found) {
        return found;
      }

      // Make a fake entry for the unchanged element to display as the parent's opcode
      const fakeEntry: ChangedElementEntry = {
        id,
        opcode,
        classId: "",
        type: 0,
        loaded: false,
        indirect: changedElementIds.has(id) ? undefined : true,
      };
      return fakeEntry;
    };

    const entries: ChangedElementEntry[] = entry.children
      .filter((id: string) => entry.opcode === DbOpcode.Delete || !deletedElementIds.has(id))
      .map((id: string) => {
        if (inheritOpcode) {
          return mapInherited(id);
        } else {
          return mapWithOpcode(id);
        }
      });
    return entries;
  };

  /**
   * Creates an array of ChangedElementEntry that will contain some fake elements to represent
   * assembly children to be able to provide the correct colorization of elements when looking
   * at a certain level of inspection in the comparison
   */
  public createVisualizationEntries = (entries: ChangedElementEntry[]): ChangedElementEntry[] => {
    const deletedElementIds = new Set(
      this._changedElements
        .filter((entry: ChangedElementEntry) => entry.opcode === DbOpcode.Delete)
        .map((entry: ChangedElementEntry) => entry.id),
    );

    const entriesWithChildren = entries.filter((entry: ChangedElementEntry) => {
      return entry.children !== undefined && entry.children.length !== 0;
    });
    const allEntries = [...entries];
    const changedElementIds = new Set(
      this._changedElements.map((entry: ChangedElementEntry) => {
        return entry.id;
      }),
    );
    for (const entry of entriesWithChildren) {
      const temp = this.manufactureChildEntriesForVisualization(
        entry,
        entry.opcode,
        deletedElementIds,
        changedElementIds,
      );
      allEntries.push(...temp);
    }
    return allEntries;
  };

  /**
   * Create visualization entries for the changed elements inside models
   * Since this is called when looking at the high-level overview of 'what models have changes'
   * We must colorize everything as an 'Update' because the models themselves got indirectly
   * 'Modified'
   */
  public createVisualizationEntriesForModels = (entries: ChangedElementEntry[]): ChangedElementEntry[] => {
    const deletedElementIds = new Set(
      this._changedElements
        .filter((entry: ChangedElementEntry) => entry.opcode === DbOpcode.Delete)
        .map((entry: ChangedElementEntry) => entry.id),
    );

    // Show entries as modified
    const adjustedEntries = entries;
    const entriesWithChildren = adjustedEntries.filter(
      (entry: ChangedElementEntry) => {
        return entry.children !== undefined && entry.children.length !== 0;
      },
    );
    const allEntries = [...adjustedEntries];
    const changedElementIds = new Set(
      this._changedElements.map((entry: ChangedElementEntry) => {
        return entry.id;
      }),
    );
    for (const entry of entriesWithChildren) {
      // Always treat models as "Modified", so visualize all child elements as "Modified"
      const temp = this.manufactureChildEntriesForVisualization(
        entry,
        DbOpcode.Update,
        deletedElementIds,
        changedElementIds,
      );
      allEntries.push(...temp);
    }
    return allEntries;
  };
}

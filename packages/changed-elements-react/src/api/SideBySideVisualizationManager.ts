/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode, type Id64String } from "@itwin/core-bentley";
import { Placement3d, type GeometricElement3dProps } from "@itwin/core-common";
import {
  EmphasizeElements, IModelApp, IModelConnection, ScreenViewport, SelectionTool, SpatialViewState, TwoWayViewportSync,
  ViewState, ViewState3d
} from "@itwin/core-frontend";
import { Range3d } from "@itwin/core-geometry";
import { MinimalNamedVersion } from "@itwin/imodels-client-management";
import type { InstanceKey } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";

import { SideBySideLabelDecorator, ViewportLabelDecoration } from "../contentviews/ViewportLabel";
import { DummyTool } from "../tools/DummyTool";
import type { ChangedElement, ChangedElementEntry } from "./ChangedElementEntryCache";

/** Handles side-by-side visualization of differencing by coloring the relevant elements */
export class SideBySideVisualizationManager {
  private _defaultToolId: string | undefined;
  private _viewportSync: TwoWayViewportSync = new TwoWayViewportSync();
  private _decorator: SideBySideLabelDecorator | undefined;

  /**
   * Constructor for SideBySideVisualizationManager
   * @param _currentIModel Current IModelConnection
   * @param _targetIModel Target IModelConnection being compared against
   * @param _currentVersion Current Version of the iModel
   * @param _targetVersion Target Version of the iModel
   * @param _focusedElementKey [optional] An element to focus on the side-by-side comparison
   * @param _changedElements Changed Element Entries that we may want to show
   * @param _primaryViewport Primary Viewport that shows the current IModelConnection
   * @param _secondaryViewport Secondary Viewport that shows the target IModelConnection
   * @param _wantZooming whether to zoom to the element focused
   */
  constructor(
    private _currentIModel: IModelConnection,
    private _targetIModel: IModelConnection,
    private _currentVersion: MinimalNamedVersion,
    private _targetVersion: MinimalNamedVersion,
    private _focusedElementKey: InstanceKey | undefined,
    private _changedElements: ChangedElementEntry[],
    private _primaryViewport: ScreenViewport,
    private _secondaryViewport: ScreenViewport,
    private _wantZooming: boolean,
  ) { }

  /**
   * Calculates the zoom volume based on the focused element
   */
  private async _calculateZoomVolume(): Promise<Range3d | undefined> {
    const extendRangeFromProps = (
      props: GeometricElement3dProps[],
      range: Range3d,
    ) => {
      if (props.length !== 0) {
        props.forEach((prop: GeometricElement3dProps) => {
          const placement = Placement3d.fromJSON(prop.placement);
          range.extendRange(placement.calculateRange());
        });
      }

      return range;
    };

    if (this._focusedElementKey) {
      const ids = await SideBySideVisualizationManager.getHiliteElements(
        this._currentIModel,
        this._targetIModel,
      );
      const currentProps: GeometricElement3dProps[] =
        (await this._currentIModel.elements.getProps(ids)) as GeometricElement3dProps[];
      const targetProps: GeometricElement3dProps[] =
        (await this._targetIModel.elements.getProps(ids)) as GeometricElement3dProps[];
      const volume = Range3d.createNull();
      extendRangeFromProps(currentProps, volume);
      extendRangeFromProps(targetProps, volume);
      return volume;
    }

    return undefined;
  }

  /** Zooms both viewports to the calculated zoom volume */
  private async _zoomForComparison() {
    if (this._wantZooming && this._focusedElementKey) {
      const zoomVolume = await this._calculateZoomVolume();
      if (zoomVolume) {
        const primaryVolume = zoomVolume.clone();
        primaryVolume.ensureMinLengths(
          (this._primaryViewport.view as ViewState3d).minimumFrontDistance() * 1.1,
        );
        this._primaryViewport.zoomToVolume(primaryVolume);
        const secondaryVolume = zoomVolume.clone();
        secondaryVolume.ensureMinLengths(
          (this._secondaryViewport.view as ViewState3d).minimumFrontDistance() * 1.1,
        );
        this._secondaryViewport.zoomToVolume(secondaryVolume);
      }
    }
  }

  /**
   * Initializes the Side-By-Side visualization and let's you emphasize the given element Ids
   * @param emphasizedElements Elements to emphasize in the side-by-side comparison
   */
  public async initialize(emphasizedElements?: Set<Id64String>) {
    // Sync viewports
    await this.syncViewports();
    // Setup labels
    this.setViewportsLabels();

    // Save the default tool and set the dummy tool as default
    this._defaultToolId = IModelApp.toolAdmin.defaultToolId;
    IModelApp.toolAdmin.defaultToolId = DummyTool.toolId;
    await IModelApp.toolAdmin.startDefaultTool();

    if (emphasizedElements) {
      await this.emphasizeSet(emphasizedElements);
    }

    // Setup viewport overrides and select the focused instances
    if (this._focusedElementKey) {
      // Can't find any better way to know when viewports are ready...
      await this.selectInstanceWithScope(this._focusedElementKey);
      await this._zoomForComparison();
    }
  }

  /** Cleans up the selection listeners, viewport's visualization/overrides and default Tool Id override */
  public cleanUp() {
    // Clear selection
    if (this._currentIModel && this._targetIModel) {
      Presentation.selection.clearSelection(
        "SideBySideVisualizationManager",
        this._currentIModel,
      );
      Presentation.selection.clearSelection(
        "SideBySideVisualizationManager",
        this._targetIModel,
      );
    }
    // Clean syncing
    this.cleanupViewports();
    // Clean labels
    this.cleanViewportsLabels();
    // Clean the focused element
    this._focusedElementKey = undefined;
    // Reset to default tool
    IModelApp.toolAdmin.defaultToolId = this._defaultToolId
      ? this._defaultToolId
      : SelectionTool.toolId;
    void IModelApp.toolAdmin.startDefaultTool();
  }

  /**
   * Sets the viewport's addFeatureOverrides function for version compare coloring
   * @param noEmphasize Whether we are emphasizing or not
   */
  public setupViewportsOverrides(noEmphasize?: boolean) {
    const elements = this._changedElements;
    // const elementIds = new Set(elements.map((value: ChangedElement) => value.id));
    const updatedElems = new Set(
      elements
        .filter((value: ChangedElement) => value.opcode === DbOpcode.Update)
        .map((value: ChangedElement) => value.id),
    );
    const deletedElems = new Set(
      elements
        .filter((value: ChangedElement) => value.opcode === DbOpcode.Delete)
        .map((value: ChangedElement) => value.id),
    );
    const insertedElems = new Set(
      elements
        .filter((value: ChangedElement) => value.opcode === DbOpcode.Insert)
        .map((value: ChangedElement) => value.id),
    );
    for (const vp of IModelApp.viewManager) {
      // Clear older overrides
      const ee = EmphasizeElements.getOrCreate(vp);
      ee.wantEmphasis = true;
      ee.clearEmphasizedElements(vp);
      ee.clearOverriddenElements(vp);

      // Setup overrides and emphasize
      ee.emphasizeElements(
        [...updatedElems, ...deletedElems, ...insertedElems],
        vp,
      );

      if (!noEmphasize) {
        const defaultAppearance = ee.createDefaultAppearance();
        ee.defaultAppearance = defaultAppearance;
      }
    }
  }

  /**
   * Selects an instance in both iModelConnections (current and target) using Presentation.selection's active scope
   * @param instanceKey Instance Key of element
   */
  public async selectInstanceWithScope(instanceKey: InstanceKey): Promise<void> {
    if (this._currentIModel && this._targetIModel) {
      // Clear selections and add the selected element
      const scope = Presentation.selection.scopes.activeScope
        ? Presentation.selection.scopes.activeScope
        : "element";
      await Presentation.selection.replaceSelectionWithScope(
        "SideBySideVisualizationManager",
        this._currentIModel,
        instanceKey.id,
        scope,
      );
      await Presentation.selection.replaceSelectionWithScope(
        "SideBySideVisualizationManager",
        this._targetIModel,
        instanceKey.id,
        scope,
      );
    }
  }

  /**
   * Returns the elements that are hilighted by selection. This is used to handle assemblies
   * @param currentIModel Current IModelConnection
   * @param targetIModel Target IModelConnection being compared against
   */
  public static async getHiliteElements(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
  ): Promise<Set<Id64String>> {
    let hiliteElements = new Set<Id64String>();
    if (currentIModel) {
      const hiliteSet = await Presentation.selection.getHiliteSet(currentIModel);
      hiliteElements = new Set<Id64String>(hiliteSet.elements);
    }
    if (targetIModel) {
      const hiliteSet = await Presentation.selection.getHiliteSet(targetIModel);
      if (hiliteSet.elements) {
        hiliteElements = new Set<Id64String>([
          ...hiliteSet.elements,
          ...hiliteElements,
        ]);
      }
    }

    return hiliteElements;
  }

  /**
   * Emphasizes a set of elements without losing the coloring of version compare
   * @param emphasizedElements Set of element Ids to emphasize
   */
  public async emphasizeSet(emphasizedElements: Set<Id64String>): Promise<void> {
    for (const vp of IModelApp.viewManager) {
      // Clear older overrides
      const ee = EmphasizeElements.getOrCreate(vp);
      ee.clearEmphasizedElements(vp);
      ee.clearOverriddenElements(vp);
      ee.clearIsolatedElements(vp);
      ee.wantEmphasis = true;

      // Emphasize selected
      if (emphasizedElements.size !== 0) {
        ee.wantEmphasis = true;
        ee.emphasizeElements(emphasizedElements, vp);
      }
    }
  }

  /** Sets the feature overrides of all viewports dirty */
  public cleanOverridesInViewports() {
    for (const vp of IModelApp.viewManager) {
      // Drop feature override providers that may mess with our view
      const ee = vp.findFeatureOverrideProviderOfType(EmphasizeElements);
      if (ee !== undefined) {
        vp.dropFeatureOverrideProvider(ee);
      }
    }
  }

  /** Set labels for side-by-side comparison */
  private setViewportsLabels() {
    if (this._primaryViewport && this._secondaryViewport) {
      const primaryName = this._currentVersion.displayName;
      const secondaryName = this._targetVersion.displayName;
      const primaryDecoration: ViewportLabelDecoration =
        new ViewportLabelDecoration(
          primaryName
            ? primaryName
            : IModelApp.localization.getLocalizedString(
              "VersionCompare:versionCompare.currentVersionLabel",
            ),
          0.5,
          0.95,
          this._primaryViewport as ScreenViewport,
        );
      const secondaryDecoration: ViewportLabelDecoration =
        new ViewportLabelDecoration(
          secondaryName
            ? secondaryName
            : IModelApp.localization.getLocalizedString(
              "VersionCompare:versionCompare.targetVersionLabel",
            ),
          0.5,
          0.95,
          this._secondaryViewport as ScreenViewport,
        );
      this._decorator = new SideBySideLabelDecorator(
        primaryDecoration,
        this._primaryViewport.viewportId,
        secondaryDecoration,
        this._secondaryViewport.viewportId,
      );
      IModelApp.viewManager.addDecorator(this._decorator);
    }
  }

  /** Clean decorators */
  private cleanViewportsLabels() {
    if (this._decorator) {
      IModelApp.viewManager.dropDecorator(this._decorator);
      this._decorator = undefined;
    }
  }

  /** Syncs viewports */
  private async syncViewports() {
    if (!this._primaryViewport || !this._secondaryViewport) {
      throw new Error("Programmer Error: Viewports not given to the side-by-side visualization manager");
    }

    // Connect viewport syncing
    this._viewportSync.connect(this._primaryViewport, this._secondaryViewport);

    // Load 3D models to be able to see them side-by-side
    if (
      this._primaryViewport !== undefined &&
      this._primaryViewport.view.is3d() &&
      this._targetIModel &&
      this._primaryViewport &&
      this._secondaryViewport
    ) {
      const spatialView = this._primaryViewport.view as SpatialViewState;
      await (this._secondaryViewport as ScreenViewport).addViewedModels(spatialView.modelSelector.models);
    }
  }

  /** Cleans up viewport syncing */
  public cleanupViewports() {
    this._viewportSync.disconnect();
  }

  /**
   * Clones the given view state but in the context of the Target iModel. This is useful to
   * mirror the viewport's view state of the current iModel with the target iModel
   * @param viewState Spatial View State to clone from the current IModelConnection
   * @param targetConnection Target IModelConnection being compared against
   */
  public static async cloneViewState(
    viewState: ViewState,
    targetConnection: IModelConnection,
  ): Promise<ViewState> {
    const targetState = viewState.clone(targetConnection);
    await targetState.load();
    return targetState;
  }
}

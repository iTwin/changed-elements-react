/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { type PrimitiveValue } from "@itwin/appui-abstract";
import type { DelayLoadedTreeNodeItem, TreeNodeItem } from "@itwin/components-react";
import { BeEvent, DbOpcode, Logger } from "@itwin/core-bentley";
import { TypeOfChange } from "@itwin/core-common";
import { IModelApp, IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { SvgFolder, SvgVisibilityHalf, SvgVisibilityHide, SvgVisibilityShow } from "@itwin/itwinui-icons-react";
import {
  Breadcrumbs, Button, Checkbox, DropdownButton, IconButton, MenuDivider, MenuItem, Modal, ModalButtonBar, ModalContent,
  ProgressRadial, ToggleSwitch
} from "@itwin/itwinui-react";
import { Presentation, type SelectionChangeEventArgs } from "@itwin/presentation-frontend";
import { Component, createRef, useState, type ReactElement, type Ref, type SetStateAction } from "react";

import { type FilterOptions } from "../SavedFiltersManager.js";
import type { ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import { ChangesTreeDataProvider, isModelElementChanges } from "../api/ChangesTreeDataProvider.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages.js";
import { VersionCompare } from "../api/VersionCompare.js";
import { VersionCompareManager } from "../api/VersionCompareManager.js";
import { type VersionCompareVisualizationManager } from "../api/VersionCompareVisualization.js";
import { ExpandableSearchBar } from "../common/ExpandableSearchBar/ExpandableSearchBar.js";
import { AdvancedFilterDialog, type PropertyFilter } from "../dialogs/AdvancedFiltersDialog.js";
import { PropertyLabelCache } from "../dialogs/PropertyLabelCache.js";
import { changedElementsWidgetAttachToViewportEvent } from "./ChangedElementsWidget.js";
import { ElementsList } from "./ElementsList.js";

import "./ChangedElementsInspector.scss";

export interface ChangedElementsInspectorProps {
  manager: VersionCompareManager;
  onFilterChange?: (options: FilterOptions) => void;
  onShowAll: () => Promise<void>;
  onHideAll: () => Promise<void>;
  onInvert: () => Promise<void>;
  listRef?: Ref<HTMLDivElement>;
}

/** Get the ChangedElementEntry in a TreeNodeItem. */
const nodeToEntry = (node: TreeNodeItem): ChangedElementEntry => {
  return node.extendedData?.element as ChangedElementEntry;
};

/** Changed elements inspector component that lets the user inspect the changed elements and their children. */
export class ChangedElementsInspector extends Component<ChangedElementsInspectorProps> {
  public override render(): ReactElement {
    if (this.props.manager.changedElementsManager.entryCache.dataProvider === undefined) {
      throw new Error(
        "Changed Elements Inspector: Data Provider Undefined, ensure version compare is initialized when using this widget",
      );
    }

    return (
      <ChangedElementsListComponent
        listRef={this.props.listRef}
        dataProvider={this.props.manager.changedElementsManager.entryCache.dataProvider}
        manager={this.props.manager}
        onFilterChange={this.props.onFilterChange}
        onShowAll={this.props.onShowAll}
        onHideAll={this.props.onHideAll}
        onInvert={this.props.onInvert}
      />
    );
  }
}

interface BreadCrumbProps {
  path: TreeNodeItem[];
  rootLabel: string;
  pathClicked: (node: TreeNodeItem | undefined) => void;
}

class ChangedElementsBreadCrumb extends Component<BreadCrumbProps> {
  private _breadcrumbEndRef = createRef<HTMLDivElement>();

  public override componentDidUpdate(): void {
    // Scroll the breadcrumb to the end
    this._breadcrumbEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  private dropdownMenuItems = (close: () => void): JSX.Element[] => {
    const menuItems: JSX.Element[] = [];
    menuItems.push(
      <MenuItem key={0} onClick={() => this.props.pathClicked(undefined)}>
        {this.props.rootLabel}
      </MenuItem>,
    );
    this.props.path.forEach((node) => {
      const label = typeof node.label === "string" ? node.label : (node.label.value as PrimitiveValue).displayValue;
      menuItems.push(
        <MenuItem
          key={node.id}
          onClick={() => {
            close();
            this.props.pathClicked(node);
          }}
        >
          {label}
        </MenuItem>,
      );
    });

    return menuItems;
  };

  public override render(): ReactElement {
    const getLabel = (node: TreeNodeItem) => {
      return typeof node.label === "string" ? node.label : (node.label.value as PrimitiveValue).displayValue;
    };

    const lastNode = this.props.path.length > 0 ? this.props.path[this.props.path.length - 1] : undefined;
    return (
      <>
        {
          this.props.path.length > 0 &&
          <Breadcrumbs className="vc-itwinui-breadcrumb-container">
            <DropdownButton startIcon={<SvgFolder />} styleType="borderless" menuItems={this.dropdownMenuItems} />
            {
              lastNode &&
              <Button styleType="borderless" onClick={() => this.props.pathClicked(lastNode)}>
                {getLabel(lastNode)}
              </Button>
            }
          </Breadcrumbs>
        }
      </>
    );
  }
}

const typeOfChangeAll = (): number => {
  return (
    TypeOfChange.Geometry |
    TypeOfChange.Hidden |
    TypeOfChange.Indirect |
    TypeOfChange.Placement |
    TypeOfChange.Property
  );
};

const makeDefaultFilterOptions = (propertyNames: Set<string>): FilterOptions => {
  const wantedProperties = new Map<string, boolean>();
  // Set all properties as visible as default
  for (const prop of propertyNames) {
    wantedProperties.set(prop, true);
  }

  return {
    wantAdded: true,
    wantDeleted: true,
    wantModified: true,
    wantUnchanged: true,
    // Turn off TypeOfChange.Hidden by default
    wantedTypeOfChange: typeOfChangeAll() & ~TypeOfChange.Hidden,
    wantedProperties,
  };
};

/** Returns true if all properties are visible. */
const allPropertiesVisible = (properties: Map<string, boolean>): boolean => {
  for (const pair of properties) {
    if (pair[1] === false) {
      return false;
    }
  }

  return true;
};

const isDefaultFilterOptions = (options: FilterOptions): boolean => {
  return (
    options.wantAdded === true &&
    options.wantDeleted === true &&
    options.wantModified === true &&
    options.wantUnchanged === true &&
    options.wantedTypeOfChange === typeOfChangeAll() &&
    allPropertiesVisible(options.wantedProperties)
  );
};

interface FilterHeaderProps {
  entries: ChangedElementEntry[];
  onFilterChange: (options: FilterOptions) => void;
  onLoadLabels?: (done: boolean) => void;
  onShowAll: () => Promise<void>;
  onHideAll: () => Promise<void>;
  onInvert: () => Promise<void>;
  options: FilterOptions;
  wantTypeOfChange?: boolean;
  wantPropertyFiltering?: boolean;
  iModelConnection: IModelConnection | undefined;
  onSearchChanged?: (newFilter: string) => void;
}

function ChangeTypeFilterHeader(props: FilterHeaderProps): ReactElement {
  const [advancedFilterDialogShown, setAdvancedFilterDialogShown] = useState(false);
  const [advancedFilterDialogData, setAdvancedFilterDialogData] = useState<PropertyFilter[]>();

  /** Handle saving the advanced filter changes. */
  const handleAdvancedFilteringSave = () => {
    const opts = props.options;
    for (const data of advancedFilterDialogData ?? []) {
      opts.wantedProperties.set(data.name, data.visible ?? false);
    }

    setAdvancedFilterDialogShown(false);
    props.onFilterChange(opts);
  };

  /** Handles selected filters. */
  const handleFilterSelected = (filterOptions: FilterOptions) => {
    props.onFilterChange(filterOptions);
  };

  /** Get current filter options. */
  const getCurrentFilterOptions = () => {
    return props.options;
  };

  /** Handle opening the advanced filter property dialog. */
  const openAdvancedFilterDialog = async () => {
    VersionCompare.manager?.featureTracking?.trackAdvancedFiltersUsage();
    try {
      if (props.onLoadLabels) {
        props.onLoadLabels(false);
      }

      // Create PropertyFilter data for the dialog to use
      const data: PropertyFilter[] = [];
      for (const pair of props.options.wantedProperties) {
        const name = pair[0];
        const visible = pair[1];
        const ids: string[] = [];
        const classIds: string[] = [];
        for (const entry of props.entries) {
          if (entry.properties?.has(name)) {
            ids.push(entry.id);
            classIds.push(entry.classId);
          }
        }

        data.push({
          name,
          classId: classIds[0], // TODO: Figure out how to handle multiple class ids?
          visible,
          ids,
        });
      }

      const properties = data.map(({ name, classId }) => ({ propertyName: name, classId }));
      // Preload property labels
      if (!PropertyLabelCache.allLoaded(properties) && props.iModelConnection) {
        await PropertyLabelCache.loadLabels(props.iModelConnection, properties);
      }

      // Add labels to data and sort by label
      const finalData = data
        .map((filter) => {
          return {
            ...filter,
            label: PropertyLabelCache.getLabel(filter.classId, filter.name) ?? filter.name,
          };
        })
        .sort((a, b) => b.label?.localeCompare(a.label ?? "") ?? 0);

      props.onLoadLabels?.(true);

      setAdvancedFilterDialogData(finalData);
      setAdvancedFilterDialogShown(true);
    } catch (e) {
      // Ensure that if something fails, we let the consumer know we are 'done' loading
      Logger.logError(VersionCompare.logCategory, "Advanced Dialog Opening Error: " + (e as string));
      props.onLoadLabels?.(true);
    }
  };

  type BooleanFields<T> = keyof { [K in keyof T as T[K] extends boolean ? K : never]: T[K] };

  const handleToggle = (optionName: BooleanFields<FilterOptions>) => {
    const options = props.options;
    options[optionName] = !options[optionName];

    props.onFilterChange(options);
  };

  const legendButtonItems = (close: () => void): JSX.Element[] => [
    <div key="filter-dropdown" className="vc-filter-header-dropdown">
      <ToggleSwitch
        key="unchanged"
        className="vc-color-toggle vc-unchanged"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.unchanged")}
        labelPosition="right"
        defaultChecked={props.options.wantUnchanged}
        onChange={() => handleToggle("wantUnchanged")}
      />
      <ToggleSwitch
        key="added"
        className="vc-color-toggle vc-added"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.added")}
        labelPosition="right"
        checked={props.options.wantAdded}
        onChange={() => handleToggle("wantAdded")}
      />
      <ToggleSwitch
        key="removed"
        className="vc-color-toggle vc-deleted"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.removed")}
        labelPosition="right"
        checked={props.options.wantDeleted}
        onChange={() => handleToggle("wantDeleted")}
      />
      <ToggleSwitch
        key="modified"
        className="vc-color-toggle vc-modified"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.modified")}
        labelPosition="right"
        checked={props.options.wantModified}
        onChange={() => handleToggle("wantModified")}
      />
      {
        props.options.wantModified &&
        <>
          <MenuDivider />
          {renderTypeOfChangeMenu(close)}
        </>
      }
    </div>,
  ];

  const renderTypeOfChangeMenu = (close?: () => void) => {
    const makeContextMenuItem = (localeStr: string, flag: number) => {
      const isOn = (props.options.wantedTypeOfChange & flag) !== 0;
      return (
        <Checkbox
          key={localeStr}
          label={IModelApp.localization.getLocalizedString(`VersionCompare:typeOfChange.${localeStr}`)}
          checked={isOn}
          onChange={() => {
            const opts = props.options;
            opts.wantedTypeOfChange = isOn ? opts.wantedTypeOfChange & ~flag : opts.wantedTypeOfChange | flag;
            props.onFilterChange(opts);
          }}
        />
      );
    };

    return (
      <>
        {makeContextMenuItem("geometry", TypeOfChange.Geometry)}
        {makeContextMenuItem("placement", TypeOfChange.Placement)}
        {makeContextMenuItem("property", TypeOfChange.Property | TypeOfChange.Indirect)}
        {makeContextMenuItem("hiddenProperty", TypeOfChange.Hidden)}
        {props.wantPropertyFiltering && <div className="vc-context-menu-separator" />}
        {
          props.wantPropertyFiltering &&
          <MenuItem
            key={"AdvancedPropFilterKey"}
            onClick={async () => {
              // Close context menu
              close?.();
              // Open advanced filter dialog
              await openAdvancedFilterDialog();
            }}
          >
            {IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.advancedFiltering")}
          </MenuItem>
        }
      </>
    );
  };

  // For now, re-order toggles so that extra modified menu is at the right
  return (
    <div className="filter-header">
      <Modal
        title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.settingsTitle")}
        isOpen={advancedFilterDialogShown}
        style={{ width: "40%", minWidth: 500, minHeight: 400 }}
        onClose={() => setAdvancedFilterDialogShown(false)}
      >
        <ModalContent>
          <AdvancedFilterDialog
            data={advancedFilterDialogData ?? []}
            setData={setAdvancedFilterDialogData as (args: SetStateAction<PropertyFilter[]>) => void}
            showValues={false}
            onFilterSelected={handleFilterSelected}
            getCurrentFilterOptions={getCurrentFilterOptions}
          />
        </ModalContent>
        <ModalButtonBar>
          <Button styleType="high-visibility" onClick={handleAdvancedFilteringSave}>
            {IModelApp.localization.getLocalizedString("VersionCompare:filters.apply")}
          </Button>
          <Button onClick={() => setAdvancedFilterDialogShown(false)}>
            {IModelApp.localization.getLocalizedString("UiCore:dialog.cancel")}
          </Button>
        </ModalButtonBar>
      </Modal>
      <ExpandableSearchBar
        size="small"
        styleType="borderless"
        setFocus={true}
        valueChangedDelay={500}
        onChange={props.onSearchChanged}
      >
        <IconButton
          size="small"
          styleType="borderless"
          title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.showAll")}
          onClick={props.onShowAll}
        >
          <SvgVisibilityShow />
        </IconButton>
        <IconButton
          size="small"
          styleType="borderless"
          title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.hideAll")}
          onClick={props.onHideAll}
        >
          <SvgVisibilityHide />
        </IconButton>
        <IconButton
          size="small"
          styleType="borderless"
          title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.invertDisplay")}
          onClick={props.onInvert}
        >
          <SvgVisibilityHalf />
        </IconButton>
        <div className="filter-header-separator" />
        <DropdownButton size="small" menuItems={legendButtonItems}>
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.filter")}
        </DropdownButton>
      </ExpandableSearchBar>
    </div>
  );
}

export interface ChangedElementsListProps {
  manager: VersionCompareManager;
  dataProvider: ChangesTreeDataProvider;
  onFilterChange?: (options: FilterOptions) => void;
  onShowAll: () => Promise<void>;
  onHideAll: () => Promise<void>;
  onInvert: () => Promise<void>;
  listRef?: Ref<HTMLDivElement>;
}

export interface ChangedElementsListState {
  nodes: TreeNodeItem[];
  filteredNodes: TreeNodeItem[] | undefined;
  selectedIds: Set<string>;
  path: TreeNodeItem[];
  searchPath: TreeNodeItem[] | undefined;
  search: string | undefined;
  filterOptions: FilterOptions;
  loading: boolean;
  initialLoad: boolean;
}

export class ChangedElementsListComponent extends Component<ChangedElementsListProps, ChangedElementsListState> {
  private _attachedVp: ScreenViewport | undefined;

  private static _maintainedState: ChangedElementsListState | undefined;

  private _nodesUpdated = new BeEvent<() => void>();

  constructor(props: ChangedElementsListProps) {
    super(props);

    const propertyNames = props.manager.changedElementsManager.getAllChangedPropertyNames();
    const defaultOptions = makeDefaultFilterOptions(propertyNames);
    if (props.onFilterChange) {
      props.onFilterChange(defaultOptions);
    }

    this.state = {
      nodes: [],
      selectedIds: new Set<string>(),
      path: [],
      searchPath: undefined,
      search: undefined,
      filteredNodes: undefined,
      filterOptions: defaultOptions,
      loading: false,
      initialLoad: true,
    };
  }

  public static cleanMaintainedState = (): void => {
    ChangedElementsListComponent._maintainedState = undefined;
  };

  public override async componentDidMount(): Promise<void> {
    Presentation.selection.selectionChange.addListener(this._selectionChangedHandler);
    changedElementsWidgetAttachToViewportEvent.addListener(this.attachToViewport);
    this.props.dataProvider.searchUpdate.addListener(this._handleSearchUpdate);

    // Only do this if we are not loading from a saved state
    // If loading from a saved state, the attach to viewport call will do the work
    if (ChangedElementsListComponent._maintainedState === undefined) {
      const nodes = await this.props.dataProvider.getNodes();
      // Ensure models are filtered by the default filters
      const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
      this.setState({
        nodes,
        filteredNodes,
        initialLoad: false,
      });

      await this.setVisualization(nodes, undefined);
    }
  }

  private _handleSearchUpdate = async (): Promise<void> => {
    // Get new nodes from provider that have been updated
    const nodes = await this._getCurrentNodesFromProvider();
    const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);

    if (nodes.length !== this.state.nodes.length) {
      // Update visualization if the length of the search has changed
      const currentNode = this._getCurrentPathNode();
      await this.setVisualization(nodes, currentNode, this.state.filterOptions);
    }

    // Set the state of the element
    this.setState({ nodes, filteredNodes });
  };

  public saveState = (): void => {
    ChangedElementsListComponent._maintainedState = { ...this.state };
  };

  public clearSavedState(): void {
    ChangedElementsListComponent._maintainedState = undefined;
  }

  /** Maintain state between frontstages or when suspended. */
  public loadState = async (): Promise<void> => {
    const mState = ChangedElementsListComponent._maintainedState;
    if (mState) {
      this.setState(mState);
      if (mState.search !== undefined) {
        this.props.dataProvider.setSearch(mState.search);
      }

      // Get filtered nodes and update visualization
      await this.setVisualization(mState.nodes, this.state.path[this.state.path.length - 1], mState.filterOptions);
      // Handle unchanged visibility
      const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
      if (visualizationManager) {
        await visualizationManager.toggleUnchangedVisibility(!mState.filterOptions.wantUnchanged);
      }

      this.clearSavedState();
    }
  };

  /** Clean-up listeners and save state for later usage if needed. */
  public override componentWillUnmount(): void {
    if (this.props.manager.isComparing) {
      this.saveState();
    }

    Presentation.selection.selectionChange.removeListener(this._selectionChangedHandler);
    changedElementsWidgetAttachToViewportEvent.removeListener(this.attachToViewport);
    this.props.dataProvider.searchUpdate.removeListener(this._handleSearchUpdate);

    if (this._attachedVp) {
      this.dettachFromViewport(this._attachedVp);
      this._attachedVp = undefined;
    }
  }

  /** Try scrolling to the selected element entry if shown. */
  private _selectionChangedHandler = (args: SelectionChangeEventArgs): void => {
    let ids: string[] = [];
    args.keys.instanceKeys.forEach((keys) => { ids = [...ids, ...keys]; });
    this.setState({ selectedIds: new Set(ids) });
  };

  private _refreshVisibility = (): void => {
    // Re-render nodes so that visibility toggles are updated
    this.forceUpdate();
  };

  private onHandleShowAll = async (): Promise<void> => {
    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager && this._getCurrentPathNode() === undefined) {
      await this.toggleModelDisplay(
        visualizationManager,
        (model) => !visualizationManager.isModelVisibile(
          model.id,
          model.extendedData?.element.opcode === DbOpcode.Delete,
        ),
      );
    }

    await this.props.onShowAll();
    this._refreshVisibility();
  };

  private onHandleHideAll = async (): Promise<void> => {
    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager && this._getCurrentPathNode() === undefined) {
      await this.toggleModelDisplay(
        visualizationManager,
        (model) => visualizationManager.isModelVisibile(
          model.id,
          model.extendedData?.element.opcode === DbOpcode.Delete,
        ),
      );
    }

    await this.props.onHideAll();
    this._refreshVisibility();
  };

  private onInvert = async (): Promise<void> => {
    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager && this._getCurrentPathNode() === undefined) {
      await this.toggleModelDisplay(visualizationManager, () => true);
    }

    await this.props.onInvert();
    this._refreshVisibility();
  };

  private toggleModelDisplay = async (
    visualizationManager: VersionCompareVisualizationManager,
    filter: (model: TreeNodeItem) => boolean,
  ): Promise<void> => {
    await Promise.all(this.getNodes().filter(filter).map((model) => visualizationManager.toggleModel(model.id)));
  };

  public attachToViewport = async (vp: ScreenViewport): Promise<void> => {
    if (vp) {
      this._attachedVp = vp;
      vp.onNeverDrawnChanged.addListener(this._refreshVisibility);
      vp.onViewedCategoriesChanged.addListener(this._refreshVisibility);
      vp.onViewedModelsChanged.addListener(this._refreshVisibility);
      // Re-load nodes
      const filtered = this.props.dataProvider.filterBasedOnView(vp);
      // If filtering was changed to look at a 2D model
      // Open that model in the inspector to be inspected
      if (filtered) {
        const nodes = await this.props.dataProvider.getNodes();
        let focusNode: TreeNodeItem | undefined;
        const baseModelId = this.props.dataProvider.getViewedBaseModelId();
        if (baseModelId !== undefined) {
          focusNode = nodes.find((node) => node.extendedData && node.extendedData.modelId === baseModelId);
        }

        await this._handlePathClick(focusNode, true);
      }

      if (ChangedElementsListComponent._maintainedState !== undefined) {
        await this.loadState();
        this.clearSavedState();
      }
    }
  };

  public dettachFromViewport = (vp: ScreenViewport): void => {
    if (vp) {
      vp.onNeverDrawnChanged.removeListener(this._refreshVisibility);
      vp.onViewedCategoriesChanged.removeListener(this._refreshVisibility);
      vp.onViewedModelsChanged.removeListener(this._refreshVisibility);
    }
  };

  public isSearching = (): boolean => {
    return this.state.searchPath !== undefined;
  };

  /** Updates the state for the main comparison breadcrumb path. */
  private _updateComparisonPath = (
    nodes: TreeNodeItem[],
    filteredNodes: TreeNodeItem[] | undefined,
    path: TreeNodeItem[],
  ): void => {
    this.setState({ nodes, filteredNodes, path });
  };

  /** Updates the state for the search breadcrumb path. */
  private _updateSearchPath = (
    nodes: TreeNodeItem[],
    filteredNodes: TreeNodeItem[] | undefined,
    searchPath: TreeNodeItem[],
  ): void => {
    this.setState({ nodes, filteredNodes, searchPath });
  };

  /** Updates the current path (search or comparison). */
  private _updatePath = (
    nodes: TreeNodeItem[],
    filteredNodes: TreeNodeItem[] | undefined,
    path: TreeNodeItem[],
  ): void => {
    if (this.isSearching()) {
      this._updateSearchPath(nodes, filteredNodes, path);
    } else {
      this._updateComparisonPath(nodes, filteredNodes, path);
    }

    // Nodes updated event
    this._nodesUpdated.raiseEvent();
  };

  /** Get the currently viewed breadcrumb path */
  private _getCurrentPath = (): TreeNodeItem[] => {
    if (this.isSearching() && this.state.searchPath !== undefined) {
      return this.state.searchPath;
    } else {
      return this.state.path;
    }
  };

  private _getCurrentPathNode = (): TreeNodeItem | undefined => {
    if (this.isSearching() && this.state.searchPath !== undefined) {
      return this.state.searchPath[this.state.searchPath.length - 1];
    }

    if (this.state.path !== undefined) {
      return this.state.path[this.state.path.length - 1];
    }

    return undefined;
  };

  /** Handles breadcrumb path click. */
  private _handlePathClick = async (node: TreeNodeItem | undefined, reset?: boolean): Promise<void> => {
    // Get all nodes and filter them
    const nodes = await this.props.dataProvider.getNodes(node);
    const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
    // Update visualization based on the focused nodes
    await this.setVisualization(nodes, node);
    // If we are at the top, breadcrumb path is empty
    if (node === undefined) {
      this._updatePath(nodes, filteredNodes, []);
      return;
    }

    // Update the breadcrumb path with the new nodes being inspected
    let path = reset ? [node] : [...this._getCurrentPath()];
    const index = path.findIndex((tmpNode) => tmpNode.id === node.id);
    path = path.slice(0, index + 1);

    this._updatePath(nodes, filteredNodes, path);
  };

  private _isModelNode = (node: TreeNodeItem): unknown => {
    return node.extendedData?.isModel;
  };

  private _areModelNodes = (nodes: TreeNodeItem[]): boolean => {
    for (const node of nodes) {
      if (!this._isModelNode(node)) {
        return false;
      }
    }

    return true;
  };

  private _isElementNode = (node: TreeNodeItem): boolean => {
    return node.extendedData !== undefined && node.extendedData.isModel === undefined;
  };

  private _entryToChildren = (entry: ChangedElementEntry): ChangedElementEntry[] => {
    if (entry.children === undefined) {
      return [];
    }

    const ids: Set<string> = new Set(entry.children);
    return this.props.dataProvider.getEntriesFromIds(ids);
  };

  /** Returns true it state's filterOptions matches the entry. */
  private _filterEntryWithOptions = (entry: ChangedElementEntry): boolean => {
    return this._filterEntryWithGivenOptions(entry, this.state.filterOptions);
  };

  /** Returns true if filterOptions matches the entry. */
  private _filterEntryWithGivenOptions = (entry: ChangedElementEntry, opts: FilterOptions): boolean => {
    return this._wantShowEntry(entry, opts);
  };

  /** Obtains the children nodes of the models, creates their entries, and visualizes them. */
  private _visualizeModelNodes = async (nodes: TreeNodeItem[], options?: FilterOptions): Promise<void> => {
    // Handle model nodes: Get the children entries they already have into an array
    const filter = options
      ? (entry: ChangedElementEntry) => this._filterEntryWithGivenOptions(entry, options)
      : this._filterEntryWithOptions;
    const modelIds = new Set(nodes.map((value) => value.id));
    const entries = this.props.dataProvider.getEntriesWithModelIds(modelIds, filter);
    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    await visualizationManager?.setFocusedElements(entries);
  };

  /**
   * Gets all the entries and child entries in a single array from the given nodes.
   * @param targetNode Target node/parent node
   */
  private _getEntriesToVisualize = (targetNode: TreeNodeItem | undefined): ChangedElementEntry[] => {
    const entries: ChangedElementEntry[] = [];
    if (targetNode === undefined || !this._isElementNode(targetNode)) {
      return [];
    }

    const entry = nodeToEntry(targetNode);
    const children = this._entryToChildren(entry);
    entries.push(...children, entry);
    return entries;
  };

  /** Gets the element nodes, creates visualization entries and visualizes them. */
  private _visualizeElementNodes = async (
    directChildNodes: TreeNodeItem[],
    targetNode: TreeNodeItem | undefined,
    options?: FilterOptions,
  ): Promise<void> => {
    // Get entries to visualize containing the relevant children entries as well
    const entries = targetNode ? this._getEntriesToVisualize(targetNode) : directChildNodes.map(nodeToEntry);

    // Filter function for matching to the given filter options
    const filterFunc = options
      ? (entry: ChangedElementEntry) => this._filterEntryWithGivenOptions(entry, options)
      : this._filterEntryWithOptions;

    // Visualize the filtered elements and focus
    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    await visualizationManager?.setFocusedElements(entries.filter(filterFunc));
  };

  /** Sets viewport visualization based on the given nodes and target/parent node. */
  public setVisualization = async (
    nodes: TreeNodeItem[],
    targetNode: TreeNodeItem | undefined,
    options?: FilterOptions,
  ): Promise<void> => {
    if (nodes.length === 0 && targetNode === undefined) {
      // Visualize no focused elements
      const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
      if (visualizationManager) {
        await visualizationManager.setFocusedElements([]);
      }

      return;
    }

    if (this._areModelNodes(nodes)) {
      // Visualize all model nodes given
      await this._visualizeModelNodes(nodes, options);
    } else if (targetNode !== undefined && this._areModelNodes([targetNode])) {
      // Visualize all elements in the given target model
      await this._visualizeModelNodes([targetNode], options);
    } else {
      // Visualize the element nodes being inspected
      await this._visualizeElementNodes(nodes, targetNode, options);
    }
  };

  /** Returns true if any of the entry's properties are being visualized. */
  private _anyEntryPropertiesVisible = (entry: ChangedElementEntry, options: FilterOptions): boolean => {
    if (entry.properties === undefined) {
      // Shouldn't happen
      return true;
    }

    for (const prop of entry.properties) {
      const visible = options.wantedProperties.get(prop[0]);
      if (visible !== undefined && visible === true) {
        return true;
      }
    }

    return false;
  };

  /**
   * Returns true if the entry matches the given filter options in any way (Only tests type of change and property
   * filtering).
   * @param entry Entry to test
   * @param options FilterOptions
   */
  private _modifiedEntryMatchesFilters = (entry: ChangedElementEntry, options: FilterOptions): boolean => {
    // Nothing to do if we are not using type of change filtering
    if (!this.props.manager.wantTypeOfChange) {
      return true;
    }

    // Treat an indirect element as invalid for the filter matching, they will be shown due to their child elements
    // wanted to get show, not because they contain specific modified changes that match the filters
    if (entry.indirect !== undefined && entry.indirect) {
      return false;
    }

    // Check wanted type of change matches the type of change of the entry
    if ((options.wantedTypeOfChange & entry.type) === 0) {
      return false;
    }

    // If we don't care about property filter, entry has matched type of change at this point
    if (!this.props.manager.wantPropertyFiltering) {
      return true;
    }

    // Type of change filtering matches, and we have no properties to check, so entry matches filter
    if ((entry.type & (TypeOfChange.Property | TypeOfChange.Indirect)) === 0) {
      return true;
    }

    // Only thing left to do is to check that the entry's properties are visible in filters
    return this._anyEntryPropertiesVisible(entry, options);
  };

  /** Returns true if the entry matches the filter options. */
  private _wantShowEntry = (entry: ChangedElementEntry, options: FilterOptions): boolean => {
    if (entry.indirect && entry.children === undefined) {
      return true;
    }

    return (
      (options.wantAdded && entry.opcode === DbOpcode.Insert) ||
      (options.wantModified && entry.opcode === DbOpcode.Update && this._modifiedEntryMatchesFilters(entry, options)) ||
      (options.wantDeleted && entry.opcode === DbOpcode.Delete)
    );
  };

  /** Returns true if any of the children of the entry matches the filter options. */
  private _childrenWantShow = (parent: ChangedElementEntry, options: FilterOptions): boolean => {
    const children = parent.children;
    if (children === undefined) {
      return false;
    }

    const entries = this.props.manager.changedElementsManager.entryCache.changedElementEntries;
    for (const child of children) {
      const entry = entries.get(child);
      if (entry !== undefined && (this._wantShowEntry(entry, options) || this._childrenWantShow(entry, options))) {
        return true;
      }
    }

    return false;
  };

  /** Returns true if the model node has any entries internally that match the filter options */
  private _wantShowModelNode(node: TreeNodeItem, options: FilterOptions): boolean {
    const modelChanges = node.extendedData?.modelChanges;
    if (!isModelElementChanges(modelChanges)) {
      return true;
    }

    return (
      (options.wantAdded && modelChanges.hasInserts) ||
      (options.wantDeleted && modelChanges.hasDeletions) ||
      (options.wantModified && modelChanges.hasUpdates && (options.wantedTypeOfChange & modelChanges.typeOfChange) > 0)
    );
  }

  /** Returns true if the node matches the filter options. */
  private _wantShowNode = (node: TreeNodeItem, options: FilterOptions): boolean => {
    if (node.extendedData === undefined) {
      return false;
    }

    // If we defer model node loading, use the summarized ModelElementChanges for filtering model nodes faster
    if (node.extendedData?.isModel) {
      return isDefaultFilterOptions(options) || this._wantShowModelNode(node, options);
    }

    const opcode = node.extendedData.element !== undefined ? node.extendedData.element.opcode : undefined;

    if (opcode === undefined) {
      return options.wantUnchanged;
    }

    const entry = node.extendedData.element as ChangedElementEntry;
    return this._wantShowEntry(entry, options) || this._childrenWantShow(entry, options);
  };

  /** Filter nodes based on the given options. */
  public getFilteredNodes = (nodes: TreeNodeItem[], options: FilterOptions): TreeNodeItem[] | undefined => {
    // Nothing to filter
    if (isDefaultFilterOptions(options)) {
      return undefined;
    }

    // Filter based on the options
    return nodes.filter((node) => this._wantShowNode(node, options));
  };

  /** Update filter options and update visualization. */
  public handleFilterChange = async (options: FilterOptions): Promise<void> => {
    // Get filtered nodes and update visualization
    const filteredNodes = this.getFilteredNodes(this.state.nodes, options);
    await this.setVisualization(this.state.nodes, this.state.path[this.state.path.length - 1], options);
    // Handle unchanged visibility
    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager) {
      await visualizationManager.toggleUnchangedVisibility(!options.wantUnchanged);
    }

    // Bubble up filter options
    if (this.props.onFilterChange) {
      this.props.onFilterChange(options);
    }

    // Update state
    this.setState({ filteredNodes, filterOptions: options });
    // Nodes updated event
    this._nodesUpdated.raiseEvent();
    // Bubble up the filter options
    if (this.props.onFilterChange) {
      this.props.onFilterChange(options);
    }
  };

  /** Returns true if the node has changed elements as its children. */
  private _nodeHasChangedChildren(item: TreeNodeItem): boolean {
    return item.extendedData?.element?.hasChangedChildren;
  }

  private _modelNodeHasChangedChildren(item: TreeNodeItem): boolean {
    if (
      item.extendedData?.isModel === undefined ||
      item.extendedData?.isModel === false ||
      item.extendedData?.childrenEntries === undefined
    ) {
      return false;
    }

    return item.extendedData.childrenEntries.length !== 0;
  }

  public getNodes(): TreeNodeItem[] {
    if (this.state.filteredNodes !== undefined) {
      return this.state.filteredNodes;
    }

    return this.state.nodes;
  }

  /** Handle clearing search */
  private _handleClearSearch = async (): Promise<void> => {
    // Clear search in data provider
    this.props.dataProvider.setSearch(undefined);
    // Get nodes, will take a while depending on iModel since labels must be loaded
    const currentNode = this.state.path.length !== 0 ? this.state.path[this.state.path.length - 1] : undefined;
    const nodes = await this.props.dataProvider.getNodes(currentNode);
    const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
    await this.setVisualization(nodes, currentNode);
    this.setState({
      nodes,
      searchPath: undefined,
      search: undefined,
      filteredNodes,
      loading: false,
    });
    // Nodes updated event
    this._nodesUpdated.raiseEvent();
  };

  private async _getCurrentNodesFromProvider(): Promise<DelayLoadedTreeNodeItem[]> {
    const currentNode = this._getCurrentPathNode();
    const nodes = await this.props.dataProvider.getNodes(currentNode);
    return nodes;
  }

  /** Updates nodes from data provider. */
  private _reloadNodes = async (): Promise<void> => {
    const nodes = await this._getCurrentNodesFromProvider();
    const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
    this.setState({ nodes, filteredNodes });
    // Nodes updated event
    this._nodesUpdated.raiseEvent();
  };

  /** Loads the search */
  private _loadSearch = async (search?: string): Promise<void> => {
    this.props.dataProvider.setSearch(search);

    if (!this.props.dataProvider.isSearching()) {
      await this._handleClearSearch();
      return;
    }

    // Set loading while process finishes
    this.setState({ search, loading: true });

    // Get nodes, will take a while depending on iModel since labels must be loaded
    const nodes = await this.props.dataProvider.getNodes();
    const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
    // Update visualization based on the focused nodes
    await this.setVisualization(nodes, undefined);
    this.setState({
      nodes,
      searchPath: [],
      filteredNodes,
      loading: false,
    });

    // Nodes updated event
    this._nodesUpdated.raiseEvent();
  };

  private _loadNodes = async (nodes: TreeNodeItem[]): Promise<void> => {
    await this.props.dataProvider.load(nodes);
    await this._reloadNodes();
  };

  private _isNodeLoaded = (node: TreeNodeItem): boolean => {
    return this.props.dataProvider.isLoaded(node);
  };

  private _isSelected = (item: TreeNodeItem): boolean => {
    return this.state.selectedIds.has(item.id);
  };

  private _hasChildren = (item: DelayLoadedTreeNodeItem): boolean => {
    return item.hasChildren ??
      (item.extendedData?.isModel ? this._modelNodeHasChangedChildren(item) : this._nodeHasChangedChildren(item));
  };

  private _isItemVisible = (item: TreeNodeItem): boolean => {
    const elementIdsNeededForVisibility = this.props.dataProvider.getRelatedElementIds(item);

    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager === undefined) {
      return false;
    }

    // Visibility of element based on its children elements and itself
    return item.extendedData?.isModel
      ? visualizationManager.isModelVisibile(item.id, item.extendedData?.element.opcode === DbOpcode.Delete)
      : visualizationManager.isAnyVisible(new Set(elementIdsNeededForVisibility));
  };

  private _toggleVisibility = async (item: TreeNodeItem): Promise<void> => {
    const elementsNeededForVisibility = this.props.dataProvider.getRelatedElements(item);

    // Visibility of element based on its children elements and itself
    const isVisible = this._isItemVisible(item);

    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager) {
      if (item.extendedData?.isModel) {
        await visualizationManager.toggleModel(item.id);
      } else if (!ChangesTreeDataProvider.isFakeNode(item)) {
        await visualizationManager.toggleChangedElementsVisibility(!isVisible, elementsNeededForVisibility);
      } else {
        await visualizationManager.toggleUnchangedElementVisibility(!isVisible, item.id);
      }
    }

    this.forceUpdate();
  };

  // On expanding the element: load the child nodes in this list
  private _onInspect = async (item: TreeNodeItem): Promise<void> => {
    const isSearching = this.state.searchPath !== undefined;
    const currentPath = this._getCurrentPath();
    // If we are looking at search results, add to the search results path
    // If we are looking at the comparison, just add to the main path
    currentPath.push(item);

    this.props.dataProvider
      .load([item])
      .then(() => {
        this.props.dataProvider
          .getNodes(item)
          .then(async (nodes: DelayLoadedTreeNodeItem[]) => {
            const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
            await this.setVisualization(nodes, item);

            // Set the path or search path accordingly based on if we are looking at search results
            const path = isSearching ? this.state.path : currentPath;
            const searchPath = isSearching ? currentPath : undefined;
            this.setState({
              nodes,
              filteredNodes,
              path,
              searchPath,
              loading: false,
            });

            if (item.extendedData?.isModel && this.props.manager.options.onModelInspect) {
              this.props.manager.options.onModelInspect(item.extendedData.modelProps, item.extendedData.is2d);
            }

            // Raise event that nodes were updated
            this._nodesUpdated.raiseEvent();
          })
          .catch(() => { });
      })
      .catch(() => { });
  };

  /**
   * Selects the given entries in the passed iModel.
   * @param iModel IModel to select entries in.
   * @param entries Entries to select.
   * @param directSelection Whether to do the selection directly in the iModel instead of the presentation layer.
   */
  private _selectEntry = (iModel: IModelConnection, entry: ChangedElementEntry): void => {
    Presentation.selection
      .replaceSelectionWithScope("ChangedElementsWidget", iModel, entry.id, "element")
      .catch(() => { });
  };

  /**
   * Selects the given node element in both iModels if possible.
   * @param item Tree Node Item to select element for.
   */
  private _selectNode = (item: TreeNodeItem): void => {
    const currentIModel = this.props.manager.currentIModel;
    const targetIModel = this.props.manager.targetIModel;
    const element: ChangedElementEntry | undefined = item.extendedData?.element;
    if (currentIModel === undefined || targetIModel === undefined || element === undefined) {
      return;
    }

    // Select the entries
    if (element.opcode !== DbOpcode.Delete) {
      this._selectEntry(currentIModel, element);
    }
  };

  /**
   * On click, select the element and zoom to it.
   * @param item Tree Node that was clicked.
   */
  private _onNodeClick = async (item: TreeNodeItem): Promise<void> => {
    const visualizationManager = this.props.manager.visualization?.getSingleViewVisualizationManager();
    if (item.extendedData?.isModel && visualizationManager) {
      // Handle zooming to 3d model nodes
      if (!item.extendedData.is2d) {
        await visualizationManager.zoomToModel(item.id);
      }
    } else if (item.extendedData?.element && visualizationManager) {
      // Select the element
      this._selectNode(item);
      // Handle zooming to specific element
      await visualizationManager.zoomToEntry(item.extendedData.element);
    }
  };

  private _onPropertyCompare = async (): Promise<void> => {
    this.saveState();
    await this.props.manager.initializePropertyComparison();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetInitializeInspect);
  };

  public override render(): ReactElement {
    const nodes = this.getNodes();
    const renderLoading = () => {
      if (!this.state.loading) {
        return undefined;
      }

      return (
        <div className="vc-loading-spinner-overlay">
          <div className="vc-inner-loading-spinner">
            <ProgressRadial indeterminate />
          </div>
        </div>
      );
    };

    const renderSearchStatus = () => {
      const toLoad = this.props.dataProvider.numberOfChangedElementsToLoad();
      if (toLoad === 0) {
        return <div />;
      }

      const message = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.searchingRemaining")
        + ` ${toLoad} ` + IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.elements");
      return (
        <div className="element-list-search-status">
          <ProgressRadial size="x-small" indeterminate />
          <div className="element-list-search-status-msg">{message}</div>
        </div>
      );
    };

    // While loading labels, show that we are loading
    const onLoadLabels = (done: boolean) => {
      this.setState({ loading: !done });
    };

    const emptyMessage = this.state.initialLoad
      ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.loadingModelNodes")
      : this.props.dataProvider.isSearchingInBackground()
        ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.searchInProgress")
        : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.noResults");

    return (
      <div className="element-list-container">
        {renderLoading()}
        <ChangeTypeFilterHeader
          entries={this.props.manager.changedElementsManager.entryCache.getAll()}
          options={this.state.filterOptions}
          onFilterChange={this.handleFilterChange}
          wantTypeOfChange={this.props.manager.wantTypeOfChange}
          wantPropertyFiltering={this.props.manager.wantPropertyFiltering}
          onLoadLabels={onLoadLabels}
          iModelConnection={this.props.manager.currentIModel}
          onSearchChanged={this._loadSearch}
          onShowAll={this.onHandleShowAll}
          onHideAll={this.onHandleHideAll}
          onInvert={this.onInvert}
        />
        <ChangedElementsBreadCrumb
          rootLabel={IModelApp.localization.getLocalizedString(
            this.state.searchPath !== undefined
              ? "VersionCompare:versionCompare.searchResults"
              : "VersionCompare:versionCompare.changes",
          )}
          path={this.state.searchPath ?? this.state.path}
          pathClicked={this._handlePathClick}
        />
        <ElementsList
          ref={this.props.listRef}
          nodes={nodes}
          loadNodes={this._loadNodes}
          isLoaded={this._isNodeLoaded}
          emptyMessage={emptyMessage}
          isVisible={this._isItemVisible}
          toggleVisibility={this._toggleVisibility}
          onInspect={this._onInspect}
          onNodeClick={this._onNodeClick}
          onPropertyCompare={this._onPropertyCompare}
          isSelected={this._isSelected}
          hasChildren={this._hasChildren}
          nodesReloaded={this._nodesUpdated}
        />
        {this.isSearching() && renderSearchStatus()}
      </div>
    );
  }
}

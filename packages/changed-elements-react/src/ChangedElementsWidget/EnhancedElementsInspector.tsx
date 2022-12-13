/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./EnhancedElementsInspector.css";
import { Component, createRef, ReactElement } from "react";
import { PrimitiveValue } from "@itwin/appui-abstract";
import { DelayLoadedTreeNodeItem, TreeNodeItem } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { Localization, TypeOfChange } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { LoadingSpinner, SpinnerSize } from "@itwin/core-react";
import { SvgFolder, SvgVisibilityHalf, SvgVisibilityHide, SvgVisibilityShow } from "@itwin/itwinui-icons-react";
import {
  Breadcrumbs, Button, Checkbox, DropdownButton, IconButton, MenuDivider, MenuItem, ToggleSwitch,
} from "@itwin/itwinui-react";
import { Presentation, SelectionChangeEventArgs } from "@itwin/presentation-frontend";
import { Opcode } from "../api/changedElementsApi";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../VerboseMessages";
import { VersionCompareManager } from "../VersionCompareManager";
import { ChangedElementEntry } from "./ChangedElementEntryCache";
import { ChangesTreeDataProvider } from "./ChangesTreeDataProvider";
import { ElementsList } from "./ElementsList";
import { ExpandableSearchBar } from "./ExpandableSearchBar";

export interface ChangedElementsInspectorProps {
  localization: Localization;
  manager: VersionCompareManager;
  onFilterChange?: (options: FilterOptions) => void;
}

/** Changed elements inspector component that lets the user inspect the changed elements and their children. */
export function ChangedElementsInspector(props: ChangedElementsInspectorProps): ReactElement {
  if (props.manager.changedElementsManager.entryCache.dataProvider === undefined) {
    throw new Error(
      "Changed Elements Inspector: Data Provider Undefined, ensure version compare is initialized when using this widget",
    );
  }

  return (
    <ChangedElementsListComponent
      localization={props.localization}
      dataProvider={props.manager.changedElementsManager.entryCache.dataProvider}
      manager={props.manager}
      onFilterChange={props.onFilterChange}
    />
  );
}

interface ChangedElementsListProps {
  localization: Localization;
  manager: VersionCompareManager;
  dataProvider: ChangesTreeDataProvider;
  onFilterChange?: (options: FilterOptions) => void;
}

interface ChangedElementsListState {
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

class ChangedElementsListComponent extends Component<ChangedElementsListProps, ChangedElementsListState> {

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
    }
  }

  private _handleSearchUpdate = async (): Promise<void> => {
    // Get new nodes from provider that have been updated
    const nodes = await this._getCurrentNodesFromProvider();
    const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
    this.setState({ nodes, filteredNodes });
  };

  public saveState = (): void => {
    ChangedElementsListComponent._maintainedState = { ...this.state };
  };

  public clearSavedState(): void {
    ChangedElementsListComponent._maintainedState = undefined;
  }

  /** Maintain state between frontstages or when suspended */
  public loadState = async (): Promise<void> => {
    const mState = ChangedElementsListComponent._maintainedState;
    if (mState) {
      this.setState(mState);
      if (mState.search !== undefined) {
        this.props.dataProvider.setSearch(mState.search);
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
    this.props.dataProvider.searchUpdate.removeListener(this._handleSearchUpdate);

    ChangedElementsListComponent.cleanMaintainedState();
  }

  /** Try scrolling to the selected element entry if shown */
  private _selectionChangedHandler = (args: SelectionChangeEventArgs): void => {
    let ids: string[] = [];

    args.keys.instanceKeys.forEach((keys) => {
      ids = [...ids, ...keys];
    });

    this.setState({ selectedIds: new Set(ids) });
  };

  public isSearching = (): boolean => {
    return this.state.searchPath !== undefined;
  };

  /** Updates the state for the main comparison breadcrumb path */
  private _updateComparisonPath = (
    nodes: TreeNodeItem[],
    filteredNodes: TreeNodeItem[] | undefined,
    path: TreeNodeItem[],
  ): void => {
    this.setState({ nodes, filteredNodes, path });
  };

  /** Updates the state for the search breadcrumb path */
  private _updateSearchPath = (
    nodes: TreeNodeItem[],
    filteredNodes: TreeNodeItem[] | undefined,
    searchPath: TreeNodeItem[],
  ): void => {
    this.setState({ nodes, filteredNodes, searchPath });
  };

  /** Updates the current path (search or comparison) */
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

  /** Handles breadcrumb path click */
  private _handlePathClick = async (node: TreeNodeItem | undefined, reset?: boolean): Promise<void> => {
    // Get all nodes and filter them
    const nodes = await this.props.dataProvider.getNodes(node);
    const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
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
   * Returns true if the entry matches the given filter options in any way.
   * (Only tests type of change and property filtering).
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

  /** Returns true if the entry matches the filter options */
  private _wantShowEntry = (entry: ChangedElementEntry, options: FilterOptions): boolean => {
    if (entry.indirect && entry.children === undefined) {
      return true;
    }

    return (
      (options.wantAdded && entry.opcode === Opcode.Insert) ||
      (options.wantModified && entry.opcode === Opcode.Update && this._modifiedEntryMatchesFilters(entry, options)) ||
      (options.wantDeleted && entry.opcode === Opcode.Delete)
    );
  };

  /** Returns true if any of the children of the entry matches the filter options */
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

  /** Returns true if the node matches the filter options */
  private _wantShowNode = (node: TreeNodeItem, options: FilterOptions): boolean => {
    if (node.extendedData === undefined) {
      return false;
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
  private _reloadNodes = async () => {
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
    return item.hasChildren
      ?? (item.extendedData?.isModel ? this._modelNodeHasChangedChildren(item) : this._nodeHasChangedChildren(item));
  };

  private _isItemVisible = (_item: TreeNodeItem): boolean => {
    return false;
  };

  private _toggleVisibility = async (_item: TreeNodeItem): Promise<void> => {
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
          .then(async (nodes) => {
            const filteredNodes = this.getFilteredNodes(nodes, this.state.filterOptions);
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
   * On click, select the element and zoom to it.
   * @param item Tree Node that was clicked
   */
  private _onNodeClick = async (_item: TreeNodeItem): Promise<void> => { };

  private _onPropertyCompare = async (): Promise<void> => {
    this.saveState();
    await this.props.manager.initializePropertyComparison();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetInitializeInspect);
  };

  public override render(): ReactElement {
    const nodes = this.getNodes();
    const renderLoading = () => {
      return this.state.loading ? (
        <div className="vc-loading-spinner-overlay">
          <div className="vc-inner-loading-spinner">
            <LoadingSpinner />
          </div>
        </div>
      ) : undefined;
    };

    const renderSearchStatus = () => {
      const toLoad = this.props.dataProvider.numberOfChangedElementsToLoad();
      if (toLoad === 0) {
        return <div />;
      }

      const message = IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.searchingRemaining") +
        " " + toLoad + " " + IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.elements");
      return (
        <div className="element-list-search-status">
          <LoadingSpinner size={SpinnerSize.Small} />
          <div className="element-list-search-status-msg">{message}</div>
        </div>
      );
    };

    // While loading labels, show that we are loading
    const onLoadLabels = (done: boolean) => {
      this.setState({ loading: !done });
    };

    const emptyMessage = this.state.initialLoad
      ? IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.loadingModelNodes")
      : this.props.dataProvider.isSearchingInBackground()
        ? IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.searchInProgress")
        : IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.noResults");

    return (
      <div className="itwin-changed-elements-react__element-list-container">
        {renderLoading()}
        <ChangeTypeFilterHeader
          localization={this.props.localization}
          entries={this.props.manager.changedElementsManager.entryCache.getAll()}
          options={this.state.filterOptions}
          onFilterChange={this.handleFilterChange}
          wantTypeOfChange={this.props.manager.wantTypeOfChange}
          wantPropertyFiltering={this.props.manager.wantPropertyFiltering && this.props.manager.wantNinezone}
          wantSavedFilters={this.props.manager.wantSavedFilters}
          onLoadLabels={onLoadLabels}
          iModelConnection={this.props.manager.currentIModel}
          onSearchChanged={this._loadSearch}
        />
        <ChangedElementsBreadCrumb
          rootLabel={IModelApp.localization.getLocalizedString(
            this.state.searchPath !== undefined
              ? "VersionCompare:changedElementsInspector.searchResults"
              : "VersionCompare:changedElementsInspector.changes",
          )}
          path={this.state.searchPath ?? this.state.path}
          pathClicked={this._handlePathClick}
        />
        <ElementsList
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

export interface FilterOptions {
  wantAdded: boolean;
  wantDeleted: boolean;
  wantModified: boolean;
  wantUnchanged: boolean;
  wantedTypeOfChange: number;
  wantedProperties: Map<string, boolean>;
}


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
    wantedTypeOfChange: typeOfChangeAll & ~TypeOfChange.Hidden,
    wantedProperties,
  };
};

const isDefaultFilterOptions = (options: FilterOptions): boolean => {
  return (
    options.wantAdded === true &&
    options.wantDeleted === true &&
    options.wantModified === true &&
    options.wantUnchanged === true &&
    options.wantedTypeOfChange === typeOfChangeAll &&
    allPropertiesVisible(options.wantedProperties)
  );
};

const typeOfChangeAll
  = TypeOfChange.Geometry
  | TypeOfChange.Hidden
  | TypeOfChange.Indirect
  | TypeOfChange.Placement
  | TypeOfChange.Property;


/** Returns true if all properties are visible */
const allPropertiesVisible = (properties: Map<string, boolean>): boolean => {
  for (const pair of properties) {
    if (pair[1] === false) {
      return false;
    }
  }

  return true;
};

interface FilterHeaderProps {
  localization: Localization;
  entries: ChangedElementEntry[];
  onFilterChange: (options: FilterOptions) => void;
  onLoadLabels?: (done: boolean) => void;
  options: FilterOptions;
  wantTypeOfChange?: boolean;
  wantPropertyFiltering?: boolean;
  wantSavedFilters?: boolean;
  iModelConnection: IModelConnection | undefined;
  onSearchChanged?: (newFilter: string) => void;
}

function ChangeTypeFilterHeader(props: FilterHeaderProps): ReactElement {
  const handleToggle = (optionName: "wantAdded" | "wantDeleted" | "wantModified" | "wantUnchanged"): void => {
    props.options[optionName] = !props.options[optionName];
    props.onFilterChange(props.options);
  };

  const legendButtonItems = () => [
    <div key="filter-dropdown" className="itwin-changed-elements-react__vc-filter-header-dropdown">
      <ToggleSwitch
        key="unchanged"
        className="itwin-changed-elements-react__vc-color-toggle itwin-changed-elements-react__vc-unchanged"
        label={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.unchanged")}
        labelPosition="right"
        defaultChecked={props.options.wantUnchanged}
        onChange={() => handleToggle("wantUnchanged")}
      />
      <ToggleSwitch
        key="added"
        className="itwin-changed-elements-react__vc-color-toggle itwin-changed-elements-react__vc-added"
        label={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.added")}
        labelPosition="right"
        checked={props.options.wantAdded}
        onChange={() => handleToggle("wantAdded")}
      />
      <ToggleSwitch
        key="removed"
        className="itwin-changed-elements-react__vc-color-toggle itwin-changed-elements-react__vc-deleted"
        label={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.removed")}
        labelPosition="right"
        checked={props.options.wantDeleted}
        onChange={() => handleToggle("wantDeleted")}
      />
      <ToggleSwitch
        key="modified"
        className="itwin-changed-elements-react__vc-color-toggle itwin-changed-elements-react__vc-modified"
        label={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.modified")}
        labelPosition="right"
        checked={props.options.wantModified}
        onChange={() => handleToggle("wantModified")}
      />
      {
        props.options.wantModified &&
        <>
          <MenuDivider />
          {renderTypeOfChangeMenu()}
        </>
      }
    </div>,
  ];

  const renderTypeOfChangeMenu = () => {
    const makeContextMenuItem = (localeStr: string, flag: number) => {
      const isOn = (props.options.wantedTypeOfChange & flag) !== 0;
      return (
        <Checkbox
          key={localeStr}
          label={IModelApp.localization.getLocalizedString(localeStr)}
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
        {makeContextMenuItem("VersionCompare:typeOfChange.geometry", TypeOfChange.Geometry)}
        {makeContextMenuItem("VersionCompare:typeOfChange.placement", TypeOfChange.Placement)}
        {makeContextMenuItem("VersionCompare:typeOfChange.property", TypeOfChange.Property | TypeOfChange.Indirect)}
        {makeContextMenuItem("VersionCompare:typeOfChange.hiddenProperty", TypeOfChange.Hidden)}
      </>
    );
  };

  // For now, re-order toggles so that extra modified menu is at the right
  return (
    <ExpandableSearchBar
      localization={props.localization}
      size="small"
      styleType="borderless"
      enableFilterBar
      setFocus={true}
      valueChangedDelay={500}
      onChange={props.onSearchChanged}
    >
      <IconButton
        size="small"
        styleType="borderless"
        title={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.showAll")}
      >
        <SvgVisibilityShow />
      </IconButton>
      <IconButton
        size="small"
        styleType="borderless"
        title={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.hideAll")}
      >
        <SvgVisibilityHide />
      </IconButton>
      <IconButton
        size="small"
        styleType="borderless"
        title={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.invertDisplay")}
      >
        <SvgVisibilityHalf />
      </IconButton>
      <div className="itwin-changed-elements-react__filter-header-separator" />
      <DropdownButton size="small" menuItems={legendButtonItems}>
        {IModelApp.localization.getLocalizedString("VersionCompare:changedElementsInspector.filter")}
      </DropdownButton>
    </ExpandableSearchBar>
  );
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
    if (this._breadcrumbEndRef.current !== null) {
      this._breadcrumbEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }

  private dropdownMenuItems = (close: () => void): JSX.Element[] => {
    const menuItems: JSX.Element[] = [];
    menuItems.push(
      <MenuItem key={0} onClick={() => this.props.pathClicked(undefined)}>
        {this.props.rootLabel}
      </MenuItem>,
    );
    this.props.path.forEach((node: TreeNodeItem) => {
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

  public override render(): ReactElement | null {
    const getLabel = (node: TreeNodeItem) => {
      return typeof node.label === "string" ? node.label : (node.label.value as PrimitiveValue).displayValue;
    };

    const lastNode = this.props.path.length > 0 ? this.props.path[this.props.path.length - 1] : undefined;
    if (!lastNode) {
      return null;
    }

    return (
      <Breadcrumbs className="vc-itwinui-breadcrumb-container">
        <DropdownButton startIcon={<SvgFolder />} styleType="borderless" menuItems={this.dropdownMenuItems} />
        <Button styleType="borderless" onClick={() => this.props.pathClicked(lastNode)}>
          {getLabel(lastNode)}
        </Button>
      </Breadcrumbs>
    );
  }
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ElementsList.css";
import { Component, createRef, ReactElement } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";
import { TreeNodeItem } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { Presentation, SelectionChangeEventArgs } from "@itwin/presentation-frontend";
import { ElementNodeComponent } from "./ElementNodeComponent";

export interface ElementsListProps {
  /** Nodes to display and load. */
  nodes: TreeNodeItem[];

  /** Called when infinite spinner wants to load the given nodes. */
  loadNodes: (nodes: TreeNodeItem[]) => Promise<void>;

  /** Should return true if the node is loaded. */
  isLoaded: (node: TreeNodeItem) => boolean;

  /** Message to show when array of nodes is empty. */
  emptyMessage: string;

  /** Whether a node is visible in the view or not. */
  isVisible: (node: TreeNodeItem) => boolean;

  /** Toggle visibility of node/element. */
  toggleVisibility: (node: TreeNodeItem) => void;

  /** On clicking the inspect chevron of the node. */
  onInspect: (node: TreeNodeItem) => Promise<void>;

  /** On selecting the node in the list. */
  onNodeClick: (node: TreeNodeItem) => void;

  /** On property compare icon click. */
  onPropertyCompare: () => void;

  /** Whether the node is currently selected. */
  isSelected: (node: TreeNodeItem) => boolean;

  /** Whether a node has children and should show a chevron. */
  hasChildren: (node: TreeNodeItem) => boolean;

  /** Event triggered when nodes should be reloaded in the list. */
  nodesReloaded: BeEvent<() => void>;
}

/** InfiniteLoader list of elements that will load on demand as user scrolls. */
export class ElementsList extends Component<ElementsListProps> {
  private _listRef = createRef<FixedSizeList>();
  private _loaderRef = createRef<InfiniteLoader>();

  private _resetCache = (): void => {
    if (this._loaderRef.current !== null) {
      this._loaderRef.current.resetloadMoreItemsCache(true);
    }
  };

  public override componentDidMount(): void {
    Presentation.selection.selectionChange.addListener(this._selectionChangedHandler);
    this.props.nodesReloaded.addListener(this._resetCache);
  }

  public override componentWillUnmount(): void {
    Presentation.selection.selectionChange.removeListener(this._selectionChangedHandler);
    this.props.nodesReloaded.removeListener(this._resetCache);
  }

  private _loadMoreItems = async (startIndex: number, stopIndex: number): Promise<void> => {
    const slice = this.props.nodes.slice(startIndex, stopIndex + 1);
    await this.props.loadNodes(slice);
  };

  private _isItemLoaded = (index: number): boolean => {
    const entry = this.props.nodes[index];
    return this.props.isLoaded(entry);
  };

  /** Try scrolling to the selected element entry if shown */
  private _selectionChangedHandler = (args: SelectionChangeEventArgs): void => {
    let ids: string[] = [];

    args.keys.instanceKeys.forEach((keys) => {
      ids = [...ids, ...keys];
    });

    // Add selection set of elements that presentation added
    const allIds = new Set([...ids, ...args.imodel.selectionSet.elements]);

    const findNodeToFocus = () => {
      for (const node of this.props.nodes) {
        if (allIds.has(node.id)) {
          return node;
        } else if (node.extendedData?.children !== undefined) {
          const children = node.extendedData.children as string[];
          if (children.some(allIds.has)) {
            return node;
          }
        }
      }

      return undefined;
    };

    if (ids.length !== 0 && this._listRef.current !== null) {
      const node = findNodeToFocus();
      if (node !== undefined && args.source !== "ChangedElementsWidget") {
        const nodeToScroll = this.props.nodes.findIndex((item) => node.id === item.id);
        if (nodeToScroll !== -1) {
          this._listRef.current.scrollToItem(nodeToScroll, "smart");
        }
      }
    }
  };

  private _renderNode = (item: TreeNodeItem) => {
    return (
      <ElementNodeComponent
        id={item.id}
        element={item.extendedData?.element}
        selected={this.props.isSelected(item)}
        label={item.label}
        isModel={item.extendedData?.isModel ?? false}
        opcode={item.extendedData?.element?.opcode}
        type={item.extendedData?.element?.type ?? 0}
        wantTypeTooltip={true}
        hasChildren={this.props.hasChildren(item)}
        loadingChildren={item.extendedData?.loadingChildren ?? false}
        visible={this.props.isVisible(item)}
        toggleVisibility={() => this.props.toggleVisibility(item)}
        wantChangeSquare={true}
        onInspect={() => this.props.onInspect(item)}
        onPropertyCompare={() => this.props.onPropertyCompare()}
        onClick={() => this.props.onNodeClick(item)}
        indirect={item.extendedData?.element?.indirect}
      />
    );
  };

  public override render(): ReactElement {
    if (this.props.nodes.length === 0) {
      return (
        <div className="itwin-changed-elements-react__element-list">
          <div className="itwin-changed-elements-react__element-list-no-results">
            {this.props.emptyMessage}
          </div>
        </div>
      );
    }

    return (
      <div className="itwin-changed-elements-react__element-list">
        <AutoSizer>
          {
            (size) => (
              <InfiniteLoader
                ref={this._loaderRef}
                isItemLoaded={this._isItemLoaded}
                itemCount={this.props.nodes.length}
                loadMoreItems={this._loadMoreItems}
              >
                {
                  ({ onItemsRendered }) => (
                    <FixedSizeList
                      ref={this._listRef}
                      className="element-list-scrollbar"
                      height={size.height}
                      itemCount={this.props.nodes.length}
                      onItemsRendered={onItemsRendered}
                      itemSize={28}
                      width={size.width}
                    >
                      {
                        (props) => (
                          <div style={props.style}>
                            {this._renderNode(this.props.nodes[props.index])}
                          </div>
                        )
                      }
                    </FixedSizeList>
                  )
                }
              </InfiniteLoader>
            )
          }
        </AutoSizer>
      </div>
    );
  }
}

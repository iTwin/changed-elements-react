/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { TreeNodeItem } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { Presentation, type SelectionChangeEventArgs } from "@itwin/presentation-frontend";
import { forwardRef, useCallback, useEffect, useRef, type ReactElement } from "react";
import { FixedSizeList } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";

import { ResizeObserverWrapper } from "../NamedVersionSelector/hooks/useResizeObserver.js";
import { mergeRefs } from "../common.js";
import { ElementNodeComponent } from "./ElementNodeComponent.js";

import "./ChangedElementsInspector.scss";

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

export const ElementsList = forwardRef<HTMLDivElement, ElementsListProps>(
  function ElementsList(props, ref): ReactElement {
    const loaderRef = useRef<InfiniteLoader>(null);
    const listRef = useRef<FixedSizeList>(null);

    useEffect(
      () => {
        const handleSelectionChanged = (args: SelectionChangeEventArgs) => {
          let ids: string[] = [];

          args.keys.instanceKeys.forEach((keys) => {
            ids = [...ids, ...keys];
          });

          // Add selection set of elements that presentation added
          const allIds = new Set([...ids, ...args.imodel.selectionSet.elements]);

          const findNodeToFocus = () => {
            for (const node of props.nodes) {
              if (allIds.has(node.id)) {
                return node;
              } else if (node.extendedData?.children !== undefined) {
                const children: string[] = node.extendedData.children;
                if (children.some(allIds.has)) {
                  return node;
                }
              }
            }

            return undefined;
          };

          if (ids.length !== 0 && listRef.current !== null) {
            const node = findNodeToFocus();
            if (node !== undefined && args.source !== "ChangedElementsWidget") {
              const nodeToScroll = props.nodes.findIndex((item) => node.id === item.id);
              if (nodeToScroll !== -1) {
                listRef.current.scrollToItem(nodeToScroll, "smart");
              }
            }
          }
        };

        Presentation.selection.selectionChange.addListener(handleSelectionChanged);
        return () => {
          Presentation.selection.selectionChange.removeListener(handleSelectionChanged);
        };
      },
      [props.nodes],
    );

    useEffect(
      () => props.nodesReloaded.addListener(() => {
        loaderRef.current?.resetloadMoreItemsCache(true);
      }),
      [props.nodesReloaded],
    );

    const isItemLoaded = useCallback(
      (index: number) => {
        const entry = props.nodes[index];
        return (0, props.isLoaded)(entry);
      },
      [props.nodes, props.isLoaded],
    );

    const loadMoreItems = useCallback(
      async (startIndex: number, stopIndex: number) => {
        const slice = props.nodes.slice(startIndex, stopIndex + 1);
        await (0, props.loadNodes)(slice);
      },
      [props.nodes, props.loadNodes],
    );


    const renderNode = useCallback(
      (item: TreeNodeItem) => {
        return (
          <ElementNodeComponent
            id={item.id}
            element={item.extendedData?.element}
            selected={(0, props.isSelected)(item)}
            label={item.label}
            isModel={item.extendedData?.isModel ?? false}
            opcode={item.extendedData?.element?.opcode}
            type={item.extendedData?.element?.type ?? 0}
            wantTypeTooltip={true}
            hasChildren={(0, props.hasChildren)(item)}
            loadingChildren={item.extendedData?.loadingChildren ?? false}
            visible={(0, props.isVisible)(item)}
            toggleVisibility={() => (0, props.toggleVisibility)(item)}
            wantChangeSquare={true}
            onInspect={() => (0, props.onInspect)(item)}
            onPropertyCompare={() => (0, props.onPropertyCompare)()}
            onClick={() => (0, props.onNodeClick)(item)}
            indirect={item.extendedData?.element?.indirect}
          />
        );
      },
      [
        props.isSelected,
        props.hasChildren,
        props.isVisible,
        props.toggleVisibility,
        props.onInspect,
        props.onPropertyCompare,
        props.onNodeClick,
      ],
    );

    if (props.nodes.length === 0) {
      return (
        <div className="element-list-no-results">
          {props.emptyMessage}
        </div>
      );
    }

    return (
      <ResizeObserverWrapper ref={ref} className="element-list">
        {(size) => {
          return (
            <InfiniteLoader
              ref={loaderRef}
              isItemLoaded={isItemLoaded}
              itemCount={props.nodes.length}
              loadMoreItems={loadMoreItems}
            >
              {({ onItemsRendered, ref }) => {
                return (
                  <FixedSizeList
                    ref={mergeRefs(ref, listRef)}
                    style={{ overflow: "overlay" }}
                    height={size.height}
                    itemCount={props.nodes.length}
                    onItemsRendered={onItemsRendered}
                    itemSize={34}
                    overscanCount={10}
                    width={size.width}
                  >
                    {(nodeProps) => {
                      return (
                        <div style={nodeProps.style}>
                          {renderNode(props.nodes[nodeProps.index])}
                        </div>
                      );
                    }}
                  </FixedSizeList>
                );
              }}
            </InfiniteLoader>
          );
        }}
      </ResizeObserverWrapper >
    );
  },
);

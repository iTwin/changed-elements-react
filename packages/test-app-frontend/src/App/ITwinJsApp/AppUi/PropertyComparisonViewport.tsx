/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { ViewportComponent, ViewStateProp } from "@itwin/imodel-components-react";
import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createIModelHiliteSetProvider, enableUnifiedSelectionSyncWithIModel } from "@itwin/unified-selection";
import React from "react";
import { getSchemaContext } from "./presentation/SchemaContextProvider";
import { getUnifiedSelectionStorage } from "./presentation/SelectionStorage";

declare global {
  interface Window { // extend the Window interface, via interface merging. https://www.typescriptlang.org/docs/handbook/declaration-merging.html
    viewport?: ScreenViewport;
  }
}

export interface PropertyComparisonViewportContentProps {
  iModelConnection: IModelConnection;
  getViewState: () => ViewStateProp | undefined;
}

/**
 * Property Comparison Viewport Control that accepts a getViewState function to obtain
 * the necessary view state on runtime
 */
export function PropertyComparisonViewportContent(props: PropertyComparisonViewportContentProps) {
  React.useEffect(() => {
    const iModelAccess = {
      ...createECSqlQueryExecutor(props.iModelConnection),
      ...createCachingECClassHierarchyInspector({
        schemaProvider: createECSchemaProvider(getSchemaContext(props.iModelConnection)),
      }),
      key: createIModelKey(props.iModelConnection),
      hiliteSet: props.iModelConnection.hilited,
      selectionSet: props.iModelConnection.selectionSet,
    };

    const selectionStorage = getUnifiedSelectionStorage();

    return enableUnifiedSelectionSyncWithIModel({
      imodelAccess: iModelAccess,
      selectionStorage: getUnifiedSelectionStorage(),
      activeScopeProvider: () => {
        return { id: "element", ancestorLevel: 1 };
      },
      imodelHiliteSetProvider: createIModelHiliteSetProvider({
        selectionStorage,
        imodelProvider: () => iModelAccess,
      }),
    });
  }, [props.iModelConnection]);

  if (props.getViewState === undefined) {
    return <div>Invalid Options For Property Comparison Viewport</div>;
  }

  return (
    <ViewportComponent
      viewState={props.getViewState()}
      imodel={props.iModelConnection}
      viewportRef={(v: ScreenViewport) => {
        // for convenience, if window defined bind viewport to window
        if (undefined !== window) {
          window.viewport = v;
        }
      } } />
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ConfigurableCreateInfo, ViewportContentControl } from "@itwin/appui-react";
import { IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { ViewportComponent, ViewStateProp } from "@itwin/imodel-components-react";
import { viewWithUnifiedSelection } from "@itwin/presentation-components";

const UnifiedSelectionViewport = viewWithUnifiedSelection(ViewportComponent);

export interface PropertyComparisonViewportControlOptions {
  iModelConnection: IModelConnection;
  getViewState: () => ViewStateProp | undefined;
}

/**
 * Property Compraison Viewport Control that accepts a getViewState function to obtain
 * the necessary view state on runtime
 */
export class PropertyComparisonViewportControl extends ViewportContentControl {
  constructor(info: ConfigurableCreateInfo, options: PropertyComparisonViewportControlOptions) {
    super(info, options);

    if (options.getViewState) {
      this.reactNode = (
        <UnifiedSelectionViewport
          viewState={options.getViewState()}
          imodel={options.iModelConnection}
          viewportRef={(v: ScreenViewport) => {
            this.viewport = v;

            // for convenience, if window defined bind viewport to window
            if (undefined !== window) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).viewport = v;
            }
          }}
        />
      );
    } else {
      this.reactNode = (
        <div>Invalid Options For Property Comparison Viewport</div>
      );
    }
  }
}

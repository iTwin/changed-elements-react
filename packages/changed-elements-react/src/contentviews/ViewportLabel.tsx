/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DecorateContext, ScreenViewport, type CanvasDecoration } from "@itwin/core-frontend";
import type { WritableXAndY } from "@itwin/core-geometry";

/** Used to render a label on top of a viewport */
export class ViewportLabelDecoration implements CanvasDecoration {
  constructor(
    public text: string,
    public widthFraction: number,
    public heightFraction: number,
    public viewport: ScreenViewport,
  ) { }

  public drawDecoration(ctx: CanvasRenderingContext2D): void {
    const x = this.viewport.viewRect.width * this.widthFraction;
    const y = this.viewport.viewRect.height * this.heightFraction;
    ctx.font = "20px arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(this.text, x, y);
  }

  public position?: Readonly<WritableXAndY> | undefined;
  public decorationCursor?: string | undefined;
}

export class SideBySideLabelDecorator {
  constructor(
    public primaryDecoration: CanvasDecoration,
    public primaryViewportId: number,
    public secondaryDecoration: CanvasDecoration,
    public secondaryViewportId: number,
  ) { }

  public decorate(context: DecorateContext) {
    if (context.viewport.viewportId === this.primaryViewportId) {
      context.addCanvasDecoration(this.primaryDecoration);
    } else if (context.viewport.viewportId === this.secondaryViewportId) {
      context.addCanvasDecoration(this.secondaryDecoration);
    }
  }
}

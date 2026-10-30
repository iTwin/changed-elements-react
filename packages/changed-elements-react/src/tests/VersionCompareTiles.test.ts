/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { FeatureSymbology } from "@itwin/core-frontend";
import { describe, expect, it, vi } from "vitest";

import { Provider } from "../api/VersionCompareTiles.js";
import { mockChangedElementEntry } from "./TestUtilities.js";

describe("VersionCompareTiles Provider", () => {
  const fakeViewport = {
    view: { is3d: () => false, clone: () => ({ getViewedModel: () => undefined }) },
    onViewportChanged: { addListener: () => () => { } },
    addTiledGraphicsProvider() { },
    addFeatureOverrideProvider() { },
    isFadeOutActive: false,
    invalidateScene() { },
    setFeatureOverrideProviderChanged() { },
  };

  const entries = [
    mockChangedElementEntry("0x1", DbOpcode.Insert),
    mockChangedElementEntry("0x2", DbOpcode.Update),
    mockChangedElementEntry("0x3", DbOpcode.Delete),
  ];

  const makeProvider = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider: any = new Provider(fakeViewport as never, {} as never, entries, {
      wantModified: true, hideUnchanged: false, hideRemoved: false, hideModified: false,
    });
    // FeatureSymbology.Overrides(undefined) yields empty overrides; avoids needing a real view state
    provider.viewport = undefined;
    return provider;
  };

  it("colors visible inserted/updated elements and hidden elements from the cached partition", () => {
    const provider = makeProvider();
    provider.hiddenChangedElems = [mockChangedElementEntry("0x9", DbOpcode.Update)];
    const overrides = new FeatureSymbology.Overrides();
    provider.addFeatureOverrides(overrides);

    expect(overrides.getElementOverridesById("0x1")).toBeDefined();
    expect(overrides.getElementOverridesById("0x2")).toBeDefined();
    expect(overrides.getElementOverridesById("0x9")).toBeDefined();
    expect(overrides.getElementOverridesById("0x3")).toBeUndefined();

    provider.visibleChangedElems = [mockChangedElementEntry("0x7", DbOpcode.Insert)];
    const afterChange = new FeatureSymbology.Overrides();
    provider.addFeatureOverrides(afterChange);
    expect(afterChange.getElementOverridesById("0x7")).toBeDefined();
    expect(afterChange.getElementOverridesById("0x1")).toBeUndefined();
  });

  it("builds the secondary iModel overrides once per invalidation", () => {
    const provider = makeProvider();
    const initSpy = vi.spyOn(provider, "initOverrides");

    const first = provider.secondaryIModelOverrides;
    expect(first.getElementOverridesById("0x3")).toBeDefined();
    expect(first.getElementOverridesById("0x2")).toBeDefined();
    expect(provider.secondaryIModelOverrides).toBe(first);
    expect(initSpy).toHaveBeenCalledTimes(1);

    provider.viewport = fakeViewport;
    provider.updateOptions({ wantModified: true, hideUnchanged: false, hideRemoved: true, hideModified: false });
    provider.updateOptions({ wantModified: true, hideUnchanged: false, hideRemoved: true, hideModified: true });
    provider.viewport = undefined;
    expect(initSpy).toHaveBeenCalledTimes(1);

    const rebuilt = provider.secondaryIModelOverrides;
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.getElementOverridesById("0x3")).toBeUndefined();
    expect(rebuilt.getElementOverridesById("0x2")).toBeUndefined();
    expect(initSpy).toHaveBeenCalledTimes(2);
  });
});

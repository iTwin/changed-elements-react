/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Cartographic, QueryBinder, type QueryOptions } from "@itwin/core-common";
import { BlankConnection, IModelApp, NoRenderApp } from "@itwin/core-frontend";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ModelsCategoryCache } from "../api/ModelsCategoryCache.js";
import { mockChangedElementEntries } from "./TestUtilities.js";

const queryMockGenerator = (bindingPostfix = "") => {
  const func = async function* (
    _ecsql: string,
    params?: QueryBinder,
    _options?: QueryOptions,
  ): AsyncIterableIterator<any> {
    const array: any[] = [];
    const bindings = params?.serialize();
    if (bindings) {
      for (const val of Object.values(bindings)) {
        if (val?.value) {
          array.push(val.value);
        }
      }
    } else {
      array.push("0xF00D");
    }
    for (const value of array) {
      yield {
        catId: value + bindingPostfix,
        model: {
          id: value + bindingPostfix,
        },
      };
    }
  };
  return func;
};

describe("Models Category Cache Tests", () => {
  beforeAll(async () => {
    vi.mock("@itwin/core-frontend", async () => {
      const module = await vi.importActual<typeof import("@itwin/core-frontend")>("@itwin/core-frontend");
      const BlankConnection = {
        create: () => {
          const load = vi.fn();
          return {
            query: queryMockGenerator("_mocked"),
            models: { load },
            changeset: { id: "unknown" },
          };
        },
      };
      return { ...module, BlankConnection };
    });

    await NoRenderApp.startup();
  });

  afterAll(async () => {
    await IModelApp.shutdown();
    vi.restoreAllMocks();
  });

  it("Should load and maintain categories and models data", async () => {
    // Mock some entries
    const mockEntries = mockChangedElementEntries(300);
    const currentIModel = BlankConnection.create({ name: "", location: Cartographic.createZero(), extents: [] });
    const targetIModel = BlankConnection.create({ name: "", location: Cartographic.createZero(), extents: [] });
    // Test loading models category cache
    await ModelsCategoryCache.load(currentIModel, targetIModel, mockEntries);

    // The loading should have caused a models load on the target iModel to ensure visualization
    expect(targetIModel.models.load).toHaveBeenCalled();

    // We should have the resulting data defined
    const data = ModelsCategoryCache.getModelsCategoryData();
    expect(data).toBeDefined();
    expect(data?.categories).toBeDefined();
    expect(data?.deletedCategories).toBeDefined();
    expect(data?.deletedElementsModels).toBeDefined();
    expect(data?.updatedElementsModels).toBeDefined();

    // Test clearing
    ModelsCategoryCache.clear();
    const cleared = ModelsCategoryCache.getModelsCategoryData();
    expect(cleared).toBeUndefined();
  });

  it("Should restore cache when using different comparisons/changesets", async () => {
    // Mock iModel connections with query functions that return the bindings
    const currentIModel = BlankConnection.create({ name: "", location: Cartographic.createZero(), extents: [] });
    (currentIModel.changeset.id as string) = "changesetA";
    const targetIModel = BlankConnection.create({ name: "", location: Cartographic.createZero(), extents: [] });
    (targetIModel.changeset.id as string) = "changesetB";
    const targetIModel2 = BlankConnection.create({ name: "", location: Cartographic.createZero(), extents: [] });
    (targetIModel2.changeset.id as string) = "changesetC";

    // Mock some entries
    const mockEntries10 = mockChangedElementEntries(10);
    const mockEntries1 = mockChangedElementEntries(1);

    // Load current vs target with 10 mock entries
    await ModelsCategoryCache.load(currentIModel, targetIModel, mockEntries10);
    // The loading should have caused a models load on the target iModel to ensure visualization
    expect(targetIModel.models.load).toHaveBeenCalled();
    // We should have the resulting data defined
    const data = ModelsCategoryCache.getModelsCategoryData();
    expect(data).toBeDefined();
    expect(data?.categories).toBeDefined();
    expect(data?.deletedCategories).toBeDefined();
    expect(data?.deletedElementsModels).toBeDefined();
    expect(data?.updatedElementsModels).toBeDefined();
    // Since we are returning the binding array for entries,
    // we should have 10 model ids
    expect(data?.updatedElementsModels.size).toBe(mockEntries10.length);

    // Load against a "different" changeset with 1 mock entry
    await ModelsCategoryCache.load(currentIModel, targetIModel2, mockEntries1);
    // The loading should have caused a models load on the target iModel to ensure visualization
    expect(targetIModel2.models.load).toHaveBeenCalled();
    // We should have the resulting data defined
    const data2 = ModelsCategoryCache.getModelsCategoryData();
    expect(data2).toBeDefined();
    expect(data2?.categories).toBeDefined();
    expect(data2?.deletedCategories).toBeDefined();
    expect(data2?.deletedElementsModels).toBeDefined();
    expect(data2?.updatedElementsModels).toBeDefined();
    // Since we are returning the binding array for entries,
    // we should have 1 model id
    expect(data2?.updatedElementsModels.size).toBe(mockEntries1.length);
  });
});

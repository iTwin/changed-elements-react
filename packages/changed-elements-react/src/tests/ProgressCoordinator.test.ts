/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProgressCoordinator } from "../widgets/ProgressCoordinator.js";

describe("ProgressCoordinator", () => {
  const enum stages {
    Stage1,
    Stage2,
    Stage3,
  };

  const weights: Record<stages, number> = {
    [stages.Stage1]: 10,
    [stages.Stage2]: 20,
    [stages.Stage3]: 70,
  };

  let progressCoordinator: ProgressCoordinator<stages>;
  let callback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    progressCoordinator = new ProgressCoordinator(weights);
    callback = vi.fn();
    progressCoordinator.onProgressChanged.addListener(callback);
  });

  it("starts as 0% and no events", () => {
    expect(progressCoordinator.getOverallPercentage()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it("updatesProgress for a specific stage", () => {
    progressCoordinator.updateProgress(stages.Stage1, 50);
    expect(progressCoordinator.getOverallPercentage()).toBe(5); // 50% * 10% = 5%
    expect(callback).toHaveBeenCalledWith(5);
  });

  it("addProgress accumulates progress for a specific stage", () => {
    progressCoordinator.updateProgress(stages.Stage1, 50);

    progressCoordinator.addProgress(stages.Stage1, 50);
    expect(progressCoordinator.getOverallPercentage()).toBe(10); // 10% * 10% = 10%
    expect(callback).toHaveBeenCalledWith(5);

    progressCoordinator.addProgress(stages.Stage2, 75);
    expect(progressCoordinator.getOverallPercentage()).toBe(25); //10% + 20% * 75% = 25%
    expect(callback).toHaveBeenCalledWith(25);
  });

  it("ignores unknown stages in updateProgress or addProgress", () => {
    progressCoordinator.updateProgress(100 as unknown as stages, 50);
    expect(progressCoordinator.getOverallPercentage()).toBe(0);
    expect(callback).not.toHaveBeenCalled();

    progressCoordinator.addProgress(100 as unknown as stages, 50);
    expect(progressCoordinator.getOverallPercentage()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it("when updateProgress or addProgress out of bounds, should be clamped to 100", () => {
    progressCoordinator.updateProgress(stages.Stage1, 150);
    expect(progressCoordinator.getOverallPercentage()).toBe(10); // 10% * 100% = 10%
    expect(callback).toHaveBeenCalledWith(10);

    progressCoordinator.addProgress(stages.Stage2, 999);
    expect(progressCoordinator.getOverallPercentage()).toBe(30); // 10% * 100% + 20% * 100% = 30%
    expect(callback).toHaveBeenCalledWith(30);

  });

  it("race condition, when multiple updates are called, the last one should be the one that is used", () => {
    progressCoordinator.updateProgress(stages.Stage1, 50);
    progressCoordinator.updateProgress(stages.Stage1, 75);
    progressCoordinator.updateProgress(stages.Stage1, 60);

    expect(progressCoordinator.getOverallPercentage()).toBe(6); // 10% * 60% = 6%
    expect(callback).toHaveBeenCalledWith(6);

    progressCoordinator.updateProgress(stages.Stage1, 100);
    progressCoordinator.updateProgress(stages.Stage2, 100);
    progressCoordinator.updateProgress(stages.Stage3, 100);
    progressCoordinator.updateProgress(stages.Stage1, 50);

    expect(callback).toHaveBeenCalledWith(5);
    expect(progressCoordinator.getOverallPercentage()).toBe(95); // 10% * 50% + 20% * 100% + 70% * 100% = 95%
  });

})

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent } from "@itwin/core-bentley";

export class ProgressCoordinator<StageType extends number>{
  private progress: Array<{ stage: StageType; currentProgress: number;}>;
  private weights: Record<StageType, number>;
  public readonly onProgressChanged = new BeEvent<(percent: number) => void>();

  constructor(weights: Record<StageType, number>) {
    this.weights = weights;

    this.progress = Object.keys(weights)
      .map(key => Number(key) as StageType)
      .sort((a, b) => a - b)
      .map(stage => ({ stage, currentProgress: 0 }));
  }

  /**
   * Updates the progress for a specific stage with overall percentage and raises the event.
   * @param stage The stage to update.
   * @param progress The progress percentage for the specified stage (0-100).
   */
  public updateProgress(stage: StageType, percent: number = 0): void {
    this.modifyProgress(stage, () => Math.min(100, Math.max(0, percent)));
  }

  /**
   * Increment the progress for a specific stage with overall percentage and raises the event.
   * @param stage The stage to update.
   * @param progress The progress percentage for the specified stage (0-100).
   */
  public addProgress(stage: StageType, percent: number): void {
    this.modifyProgress(stage, curr => Math.min(100, Math.max(0, curr + percent)));
  }

  /**
   * Computes the overall progress as a weighted percentage across all stages.
   * Each stage contributes proportionally based on its assigned weight.
   *
   * @returns A number (0-100) representing the global progress.
   */
  public getOverallPercentage(): number {
    return this.progress.reduce(
      (sum, { stage, currentProgress }) =>
        sum + (currentProgress / 100) * this.weights[stage],
      0,
    );
  }

  // helper that updates the progress and raises the event
  private modifyProgress(stage: StageType, mutator: (curr: number) => number): void {
    const idx = this.progress.findIndex(s => s.stage === stage);
    if (idx === -1) return;

    this.progress[idx].currentProgress = mutator(this.progress[idx].currentProgress);

    const overallPct = this.getOverallPercentage();
    const cap = this.progress
      .slice(0, idx + 1) // we only want to sum the weights of the stages up to and including the current one to prevent race conditions
      .reduce((sum, s) => sum + this.weights[s.stage], 0);

    this.onProgressChanged.raiseEvent(Math.min(cap, overallPct));
  }
}

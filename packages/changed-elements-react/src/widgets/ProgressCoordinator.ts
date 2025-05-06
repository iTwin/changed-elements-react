/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent } from "@itwin/core-bentley";

export enum ProgressStage {
  OpenTargetImodel = "mgs_openingTarget",
  InitComparison = "mgs_initializingComparison",
  ComputeChangedModels = "mgs_computingChangedModels", //@naron: there is no hiarchy for now, like computingChangeModels is actually part of initializing comparison, I could support that if needed
  FindParents = "mgs_findingParents",
  ObtainElementData = "mgs_obtainingElementData",
  FindChildren = "mgs_findingChildren",
  LoadIModelNodes = "loadingModelNodes",
}

export class ProgressCoordinator{
  private weights: Record<ProgressStage, number>;
  private progress: Record<ProgressStage, number>;
  public readonly onProgressChanged = new BeEvent<(pct: number, message: string) => void>();

  constructor(weights: Record<ProgressStage, number>){
    this.weights = weights;

    // init every stage as 0
    this.progress = Object.fromEntries(
      Object.keys(weights).map(stage => [stage, 0])
    ) as Record<ProgressStage, number>;
  }

  public getStageMessage(stage: ProgressStage): string {
    // const prefix = "VersionCompare:versionCompare.";
    // return IModelApp.localization.getLocalizedString(`${prefix}${stage}`); //@naron: change this to loading
    return "loading comparison"
  }

  /**
   * Updates the progress for a specific stage with overall percentage and raises the event.
   * @param stage The stage to update.
   * @param progress The progress percentage for the specified stage (0-100).
   */
  public updateProgress(stage: ProgressStage, progress: number = 0): void {
    this.progress[stage] = progress;
    const overallPercentage = this.getOverallPercentage();
    const msg = this.getStageMessage(stage);
    this.onProgressChanged.raiseEvent(overallPercentage, msg);
  }

  /**
   * Increment the progress for a specific stage with overall percentage and raises the event.
   * @param stage The stage to update.
   * @param progress The progress percentage for the specified stage (0-100).
   */
  public addProgress(stage: ProgressStage, progress: number): void {
    this.progress[stage] += progress;
    const overallPercentage = this.getOverallPercentage();
    const msg = this.getStageMessage(stage);
    this.onProgressChanged.raiseEvent(overallPercentage, msg);
  }

  /**
   * Computes the overall progress as a weighted percentage across all stages.
   * Each stage contributes proportionally based on its assigned weight.
   *
   * @returns A number (0-100) representing the global progress.
   */
  public getOverallPercentage(): number {
    return Object.entries(this.weights).reduce((sum, [stage, weight]) => {
      const p = this.progress[stage as ProgressStage] ?? 0;
      return sum + (p / 100) * weight;
    }, 0);
  }
}

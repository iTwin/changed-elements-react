/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import React from "react";
import { JobAndNamedVersions } from "../models/ComparisonJobModels";

/** Comparison Job Update Type
*  - "JobComplete" = job is completed
*  - "JobError" = job error
*  - "JobProgressing" = job is started
*  - "ComparisonVisualizationStarting" = version compare visualization is starting
*/
export type ComparisonJobUpdateType = "JobComplete" | "JobError" | "JobProcessing" | "ComparisonVisualizationStarting";

export type V2Context = {
  getDialogOpen: () => boolean;
  openDialog: () => void;
  closedDialog: () => void;
  addRunningJob: (jobId: string, comparisonJob: JobAndNamedVersions) => void;
  removeRunningJob: (jobId: string) => void;
  getRunningJobs: () => JobAndNamedVersions[];
  getPendingJobs: () => JobAndNamedVersions[];
  addPendingJob: (jobId: string, comparisonJob: JobAndNamedVersions) => void;
  removePendingJob: (jobId: string) => void;
  getToastsEnabled: () => boolean;
  runOnJobUpdate: (comparisonJobUpdateType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
};

export const V2DialogContext = React.createContext<V2Context>({} as V2Context);

export type V2DialogProviderProps = {
  children: React.ReactNode;
  // Optional. When enabled will toast messages regarding job status. If not defined will default to false and will not show toasts.
  enableComparisonJobUpdateToasts?: boolean;
  /** On Job Update
 * Optional. a call back function for handling job updates.
 * @param comparisonJobUpdateType param for the type of update:
 *  - "JobComplete" = invoked when job is completed
 *  - "JobError" = invoked on job error
 *  - "JobProgressing" = invoked on job is started
 *  - "ComparisonVisualizationStarting" = invoked on when version compare visualization is starting
 * @param jobAndNamedVersion param contain job and named version info to be passed to call back
*/
  onJobUpdate?: (comparisonJobUpdateType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
};

/** V2DialogProvider use comparison jobs for processing.
 * Used for tracking if the dialog is open or closed.
 * This is useful for managing toast messages associated with dialog.
 * Also caches comparison jobs that are pending creation or are currently running. To help populate new modal ref.
 * Example:
 *<V2DialogProvider>
 *{(isOpenCondition) &&
 * <VersionCompareSelectDialogV2
 *   iModelConnection={this.props.iModelConnection}
 *   onClose={this._handleVersionSelectDialogClose}
 * />}
 *</V2DialogProvider>
*/
export function VersionCompareSelectProviderV2({ children, enableComparisonJobUpdateToasts, onJobUpdate }: V2DialogProviderProps) {
  const dialogRunningJobs = React.useRef<Map<string, JobAndNamedVersions>>(new Map<string, JobAndNamedVersions>());
  const dialogPendingJobs = React.useRef<Map<string, JobAndNamedVersions>>(new Map<string, JobAndNamedVersions>());
  const addRunningJob = (jobId: string, jobAndNamedVersions: JobAndNamedVersions) => {
    dialogRunningJobs.current.set(jobId, {
      comparisonJob: jobAndNamedVersions.comparisonJob,
      targetNamedVersion: jobAndNamedVersions.targetNamedVersion,
      currentNamedVersion: jobAndNamedVersions.currentNamedVersion,
    });
  };
  const removeRunningJob = (jobId: string) => {
    dialogRunningJobs.current.delete(jobId);
  };
  const getRunningJobs = () => {
    return Array.from(dialogRunningJobs.current.values());
  };
  const addPendingJob = (jobId: string, jobAndNamedVersions: JobAndNamedVersions) => {
    dialogPendingJobs.current.set(jobId, {
      comparisonJob: jobAndNamedVersions.comparisonJob,
      targetNamedVersion: jobAndNamedVersions.targetNamedVersion,
      currentNamedVersion: jobAndNamedVersions.currentNamedVersion,
    });
  };
  const removePendingJob = (jobId: string) => {
    dialogPendingJobs.current.delete(jobId);
  };
  const getPendingJobs = () => {
    return Array.from(dialogPendingJobs.current.values());
  };
  const dialogOpenRef = React.useRef(false);
  const openDialog = () => {
    dialogOpenRef.current = true;
  };
  const closedDialog = () => {
    dialogOpenRef.current = false;
  };
  const getDialogOpen = () => {
    return dialogOpenRef.current;
  };
  const getToastsEnabled = () => {
    return enableComparisonJobUpdateToasts ?? false;
  };
  const runOnJobUpdate = async (comparisonEventType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => {
    if (onJobUpdate) {
      void onJobUpdate(comparisonEventType, jobAndNamedVersions);
    }
  };
  return (
    <V2DialogContext.Provider value={{
      openDialog, getDialogOpen: getDialogOpen, closedDialog, addRunningJob,
      removeRunningJob, getRunningJobs, getPendingJobs, addPendingJob, removePendingJob,
      getToastsEnabled, runOnJobUpdate,
    }}>
      {children}
    </V2DialogContext.Provider>
  );
}

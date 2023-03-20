/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { QueryRowFormat, type ModelProps } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";

import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";
import { ReportGeneratorBase, type ReportBaseOptions } from "./ReportGenerator.js";
import { VersionCompareManager } from "./VersionCompareManager.js";

/** Info for model data */
interface ModelInfo {
  /** Id of model */
  modelId: string;
  /** Name of model */
  name?: string;
  /** Source file for model */
  source?: string;
}

/** Make the query for getting the source information */
const makeQuery = (modelProps: ModelProps[]) => {
  let queryJsonProps =
    "SELECT mea.Element.Id as id, ea.JsonProperties as jsonProps FROM Bis.ExternalSourceAspect ea " +
    "JOIN bis.ExternalSourceAspect mea ON mea.Scope.Id = ea.Element.Id " +
    "WHERE mea.Kind='Model' AND mea.Element.Id in (";
  for (const prop of modelProps) {
    if (prop.id) {
      queryJsonProps += prop.id + ",";
    }
  }
  queryJsonProps = queryJsonProps.substr(0, queryJsonProps.length - 1) + ")";
  return queryJsonProps;
};

/** Returns a map for the sources of the model (model Id -> file name) */
const getModelSources = async (
  iModel: IModelConnection,
  modelProps: ModelProps[],
): Promise<Map<string, string>> => {
  // This may fail if the connector doesn't add this information
  try {
    const query = makeQuery(modelProps);
    const map = new Map<string, string>();
    for await (const row of iModel.query(query, undefined, {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    })) {
      if (row.id !== undefined && row.jsonProps !== undefined) {
        const jsonProps = JSON.parse(row.jsonProps);
        if (jsonProps?.fileName !== undefined) {
          map.set(row.id, jsonProps.fileName);
        }
      }
    }
    return map;
  } catch {
    return new Map<string, string>();
  }
};

/** Gets an array of model infos containing id, model name and source file name if available */
const getModelInfos = async (
  iModel: IModelConnection,
  modelIds: Set<string>,
): Promise<Map<string, ModelInfo>> => {
  // TODO: If we find issues later on with more test cases, we may need to find parent model ids first
  const props = await iModel.models.getProps(modelIds);
  const modelInfos = new Map<string, ModelInfo>();

  const modelSources = await getModelSources(iModel, props);

  for (const prop of props) {
    modelInfos.set(prop.id ?? "", {
      name: prop.name,
      modelId: prop.id ?? "",
      source: prop.id ? modelSources.get(prop.id) ?? "" : "",
    });
  }
  return modelInfos;
};

/**
 * Report generator for models summary of changes
 */
export class ModelReportGenerator extends ReportGeneratorBase {
  private _allModelIds: Set<string>;

  /**
   * Constructor for models report generator
   * @param _manager VersionCompareManager to use
   * @param _options Options for report
   * @param _progressCallback Callback for progress
   */
  public constructor(
    _manager: VersionCompareManager,
    _options: ReportBaseOptions = {},
    _progressCallback?: (msg: string) => void,
  ) {
    super(_manager, _options, _progressCallback);

    this._allModelIds = new Set<string>();
    this._manager.changedElementsManager.entryCache
      .getAll()
      .forEach((entry: ChangedElementEntry) => {
        if (entry.modelId) {
          this._allModelIds.add(entry.modelId);
        }
      });
  }

  private _getHeader() {
    return "Model Id,Name,Source File,Change\n";
  }

  private _infoToRow(info: ModelInfo | undefined, change: string): string {
    return (
      info?.modelId +
      "," +
      this._cleanComma(info?.name ?? "") +
      "," +
      this._cleanComma(info?.source ?? "") +
      "," +
      change +
      "\n"
    );
  }

  /** Build models CSV report string */
  protected _buildReport = async (): Promise<string> => {
    if (
      this._manager.currentIModel === undefined ||
      this._manager.targetIModel === undefined
    ) {
      throw new Error("Cannot generate report without current and target iModels");
    }

    this._reportProgress(
      IModelApp.localization.getLocalizedString("VersionCompare:report.generatingModelsReport"),
    );

    const currentModelInfos = await getModelInfos(
      this._manager.currentIModel,
      this._allModelIds,
    );
    const targetModelInfos = await getModelInfos(
      this._manager.targetIModel,
      this._allModelIds,
    );

    const modelIdsInCurrent = new Set<string>();
    for (const pair of currentModelInfos) {
      modelIdsInCurrent.add(pair[0]);
    }
    const modelIdsInTarget = new Set<string>();
    for (const pair of targetModelInfos) {
      modelIdsInTarget.add(pair[0]);
    }

    const updatedModelIds = new Set([...modelIdsInCurrent].filter((id: string) => modelIdsInTarget.has(id)));
    const deletedModelIds = new Set([...modelIdsInTarget].filter((id: string) => !updatedModelIds.has(id)));
    const addedModelIds = new Set([...modelIdsInCurrent].filter((id: string) => !updatedModelIds.has(id)));

    let reportData = "";
    reportData += this._getHeader();

    for (const id of addedModelIds) {
      const info = currentModelInfos.get(id);
      reportData += this._infoToRow(info, "Added");
    }
    for (const id of updatedModelIds) {
      const info = currentModelInfos.get(id);
      reportData += this._infoToRow(info, "Modified");
    }
    for (const id of deletedModelIds) {
      const info = targetModelInfos.get(id);
      reportData += this._infoToRow(info, "Deleted");
    }

    this._reportProgress(IModelApp.localization.getLocalizedString("VersionCompare:report.success"));

    return reportData;
  };
}

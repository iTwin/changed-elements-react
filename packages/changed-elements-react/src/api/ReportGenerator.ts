/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat, TypeOfChange } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { DisplayValue, Field, KeySet, type InstanceKey } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";

import { ChangeElementType, type ChangedElementEntry } from "./ChangedElementEntryCache.js";
import { VersionCompareManager } from "./VersionCompareManager.js";

export const downloadAsFile = (filename: string, data: string) => {
  const blob = new Blob(["\uFEFF", data], { type: "text/csv;charset=utf-18" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (undefined !== (window.navigator as any).msSaveOrOpenBlob) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).msSaveBlob(blob, filename);
  } else {
    const elem = window.document.createElement("a");
    elem.href = window.URL.createObjectURL(blob);
    elem.download = filename;
    document.body.appendChild(elem);
    elem.click();
    document.body.removeChild(elem);
  }
};

export interface ReportProperty {
  propertyName: string;
  label: string;
}

/** Base options for report generation */
export interface ReportBaseOptions {
  /** Filename to save, if not provided defaults to Comparison.csv */
  filename?: string;
  /** Add iModel name, current and target versions to filename */
  appendInfoToFilename?: boolean;
  /** Whether to add an info header at the top of the CSV file containing iModel information */
  wantInfoHeader?: boolean;
}

/** Options for report generation */
export interface ReportOptions extends ReportBaseOptions {
  /** Do not show indirect changes */
  ignoreIndirect?: boolean;
  /** Add rows for each type of change (Geometric, Placement, Property or Hidden ) */
  wantTypeOfChange?: boolean;
  /** Property names to include on report */
  properties?: ReportProperty[];
  /** Controls exporting only the visible/filtered elements in the tree/view */
  exportOnlyVisible?: boolean;
}

/** Interface to maintain property data between old and new */
interface PropertyData {
  newValue: string | undefined;
  oldValue: string | undefined;
}

interface SplitEntries {
  deletedEntries: ChangedElementEntry[];
  modifiedEntries: ChangedElementEntry[];
  addedEntries: ChangedElementEntry[];
}

/** Base class for version compare csv report generator */
export abstract class ReportGeneratorBase {
  private _reportData: string | undefined;

  constructor(
    protected _manager: VersionCompareManager,
    protected _options: ReportBaseOptions,
    protected _progressCallback?: (msg: string) => void,
  ) { }

  /** Removes commas from a string */
  protected _cleanComma(str: string): string {
    return str.replace(/,/g, ";");
  }

  /** Get CSV Info header for iModel name, etc */
  protected _getInfoHeader(): string {
    return "iModel,Current Version,Target Version,\n";
  }

  /** Get IModel Name */
  protected _getIModelName(): string {
    return this._cleanComma(this._manager.currentIModel?.name ?? "");
  }

  /** Get name of current named version */
  protected _getCurrentVersionName(): string {
    return this._cleanComma(this._manager.currentVersion?.displayName ?? "");
  }

  /** Get name of target named version */
  protected _getTargetVersionName(): string {
    return this._cleanComma(this._manager.targetVersion?.displayName ?? "");
  }

  /** Gets info data for iModel */
  protected _getInfoData(): string {
    return (
      this._getIModelName() +
      "," +
      this._getCurrentVersionName() +
      "," +
      this._getTargetVersionName() +
      "\n"
    );
  }

  /** Report progress to caller */
  protected _reportProgress(msg: string) {
    if (this._progressCallback) {
      this._progressCallback(msg);
    }
  }

  /** Gets the filename for the report */
  protected _getFilename(): string {
    let filename = "";
    if (this._options.appendInfoToFilename) {
      filename += this._getIModelName() + ".";
      filename += this._getCurrentVersionName() + ".against.";
      filename += this._getTargetVersionName() + ".";
    }

    filename += this._options.filename ?? "Comparison.csv";
    // Check if the filename contains the csv extension, if not, add it
    if (
      filename.length < 4 ||
      !filename.includes(".csv", filename.length - 5)
    ) {
      filename += ".csv";
    }
    return filename;
  }

  /** Downloads the report if it is ready */
  public downloadReport() {
    if (this._reportData === undefined) {
      return;
    }

    downloadAsFile(this._getFilename(), this._reportData);
  }

  /** Should return the contents of the CSV file */
  protected abstract _buildReport(): Promise<string>;

  /**
   * Builds the report and calls _buildReport on child classes to generate CSV data
   * @returns true if successful
   */
  public async buildReport(): Promise<boolean> {
    this._reportData = "";

    // Add info header if required
    if (this._options.wantInfoHeader) {
      this._reportData += this._getInfoHeader() + this._getInfoData() + "\n";
    }

    try {
      this._reportData += await this._buildReport();
    } catch {
      return false;
    }

    return true;
  }
}

/** Class that generates reports for version compare data */
export class ReportGenerator extends ReportGeneratorBase {
  private _wantedProperties: Set<string> | undefined;
  private _sortedProperties: ReportProperty[] | undefined;

  // Element Id -> [Property Name -> Property Value]
  private _propertyMap: Map<string, Map<string, PropertyData>> = new Map<
    string,
    Map<string, PropertyData>
  >();

  // Element Id -> Native Id
  private _nativeIdMap: Map<string, string> = new Map<string, string>();

  constructor(
    _manager: VersionCompareManager,
    protected override _options: ReportOptions = {},
    _progressCallback?: (msg: string) => void,
  ) {
    super(_manager, _options, _progressCallback);

    if (
      this._options.properties !== undefined &&
      this._manager.currentIModel !== undefined
    ) {
      this._wantedProperties = new Set(
        this._options.properties.map((prop: ReportProperty) => prop.propertyName.toLowerCase()),
      );
    }
  }

  /** Gets all entries from the entry cache and loads them if necessary */
  private _getEntries = async (): Promise<ChangedElementEntry[]> => {
    let entries: ChangedElementEntry[] = [];
    if (this._options.exportOnlyVisible) {
      // Get and load labels for the focused elements in the view/tree
      const visualizationManager =
        this._manager.visualization?.getSingleViewVisualizationManager();
      const tempEntries = visualizationManager?.getFocusedElements();
      if (tempEntries !== undefined) {
        entries = this._manager.changedElementsManager.entryCache.getCached(
          tempEntries.map((entry: ChangedElementEntry) => entry.id),
        );
        if (this._manager.changedElementsManager.labels !== undefined) {
          entries =
            await this._manager.changedElementsManager.labels.populateEntries(entries);
        }
      }
    } else {
      // Get and load all elements and all labels
      entries = await this._manager.changedElementsManager.entryCache.loadAndGetAllWithLabels();
    }

    if (this._options.ignoreIndirect) {
      return entries.filter((entry: ChangedElementEntry) => !entry.indirect);
    }

    return entries;
  };

  /** Return true if we need to process/query properties for the report */
  private _wantProperties(): boolean {
    return this._options.properties !== undefined;
  }

  /** Gets a string for the report representing the opcode */
  private _getChangeType(opcode: DbOpcode): string {
    switch (opcode) {
      case DbOpcode.Update:
        return "Modified";
      case DbOpcode.Delete:
        return "Deleted";
      case DbOpcode.Insert:
        return "Added";
      default:
        return "Unknown";
    }
  }

  /** Gets a string for the element type */
  private _getElementType(type?: ChangeElementType): string {
    if (type === undefined) {
      return "";
    }

    switch (type) {
      case ChangeElementType.Element:
        return "Element";
      case ChangeElementType.Assembly:
        return "Assembly";
      case ChangeElementType.TopAssembly:
        return "Top Assembly";
      default:
        return "Unknown";
    }
  }

  /** Gets a string for the type of change on an element */
  private _getTypeOfChange(
    typeToCheck: TypeOfChange,
    type?: TypeOfChange,
  ): string {
    if (type === undefined) {
      return "False";
    }

    return (typeToCheck & type) !== 0 ? "True" : "False";
  }

  /** Gets all field descriptors that we want from the given field */
  private _getWantedFieldsFromField(field: Field): Field[] {
    if (this._wantedProperties === undefined) {
      return [];
    }

    const result: Field[] = [];
    if (field.isNestedContentField()) {
      for (const nField of field.nestedFields) {
        const fields = this._getWantedFieldsFromField(nField);
        result.push(...fields);
      }
    }

    if (field.isPropertiesField()) {
      for (const prop of field.properties) {
        if (this._wantedProperties.has(prop.property.name.toLowerCase())) {
          result.push(field);
        }
      }
    }

    return result;
  }

  /** Gets all wanted field descriptors based on the given fields and our wanted properties */
  private _getWantedFields(fields: Field[]): Field[] {
    const wantedFields: Field[] = [];
    for (const field of fields) {
      const currentWantedFields = this._getWantedFieldsFromField(field);
      if (currentWantedFields !== undefined) {
        wantedFields.push(...currentWantedFields);
      }
    }
    return wantedFields;
  }

  /** Map entries to instance key set */
  private _entriesToKeys(
    entries: ChangedElementEntry[],
    forceElementClass?: boolean,
  ): KeySet {
    const instanceKeys: InstanceKey[] = entries.map(
      (entry: ChangedElementEntry) => ({
        id: entry.id,
        className: forceElementClass
          ? "BisCore:Element"
          : entry.classFullName ?? "BisCore:Element",
      }),
    );
    return new KeySet(instanceKeys);
  }

  /** Load native ids used in Revit/Synchro */
  private _loadNativeIds = async (
    iModel: IModelConnection,
    entries: ChangedElementEntry[],
  ): Promise<void> => {
    let ecsql =
      "SELECT Element.Id as id, Identifier as identifier from bis.ExternalSourceAspect WHERE Element.Id IN (";
    entries.forEach(() => {
      ecsql += "?,";
    });
    ecsql = ecsql.substr(0, ecsql.length - 1) + ")";
    const elementIds = entries.map((entry: ChangedElementEntry) => entry.id);
    for await (const row of iModel.query(ecsql, QueryBinder.from(elementIds), {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    })) {
      this._nativeIdMap.set(row.id, row.identifier);
    }
  };

  /** Load bulk native ids in chunks */
  private _loadBulkNativeIds = async (
    iModel: IModelConnection,
    entries: ChangedElementEntry[],
    progressKey: string,
  ): Promise<void> => {
    const chunkSize = 500;
    const numQueries = entries.length / chunkSize;

    for (let i = 0; i < entries.length; i += chunkSize) {
      const percentage = Math.floor((i / chunkSize / numQueries) * 100);
      this._reportProgress(
        IModelApp.localization.getLocalizedString(
          "VersionCompare:report." + progressKey,
        ) + ` (${percentage}%)`,
      );

      const end = Math.min(i + chunkSize, entries.length);
      const chunk = entries.slice(i, end);
      await this._loadNativeIds(iModel, chunk);
    }
  };

  /** Load native ids in bulk */
  private _loadAllNativeIds = async (entries: ChangedElementEntry[]): Promise<void> => {
    // Split queries into opcode types
    const split = this._getSplitEntries(entries);

    // Separate entries to query against each iModel
    const currentIModelEntries = this._getEntriesForIModel(split, true);
    const targetIModelEntries = split.deletedEntries;

    if (this._manager.currentIModel) {
      await this._loadBulkNativeIds(
        this._manager.currentIModel,
        currentIModelEntries,
        "queryingNewNativeIds",
      );
    }

    if (this._manager.targetIModel) {
      await this._loadBulkNativeIds(
        this._manager.targetIModel,
        targetIModelEntries,
        "queryingOldNativeIds",
      );
    }
  };

  /** Parse the display value into a string for the report */
  private _parseDisplayValue = (val: DisplayValue): string | undefined => {
    if (DisplayValue.isPrimitive(val)) {
      return val as string;
    }

    if (DisplayValue.isArray(val)) {
      let parsed = "";
      for (const innerVal of val) {
        parsed = this._parseDisplayValue(innerVal) + "; ";
      }
      return parsed;
    }

    if (DisplayValue.isMap(val)) {
      let parsed = "";
      for (const key in val) {
        parsed = key + ":" + this._parseDisplayValue(val[key]) + "; ";
      }
      return parsed;
    }

    return undefined;
  };

  /** Loads properties */
  private _loadProperties = async (
    iModel: IModelConnection,
    entries: ChangedElementEntry[],
    isNew?: boolean,
  ): Promise<void> => {
    const rulesetOrId = "Default";
    const keys = this._entriesToKeys(entries);
    const descriptor = await Presentation.presentation.getContentDescriptor({
      imodel: iModel,
      rulesetOrId,
      keys,
      displayType: "PropertyPane",
    });
    if (descriptor === undefined) {
      // TODO: Failed ...
      return;
    }
    const fields = this._getWantedFields(descriptor.fields);
    const content = await Presentation.presentation.getContent({
      imodel: iModel,
      keys,
      descriptor: {
        fieldsSelector: {
          type: "include",
          fields: fields.map((field: Field) => field.getFieldDescriptor()),
        },
      },
      rulesetOrId,
    });

    if (content !== undefined) {
      for (const singleContent of content.contentSet) {
        for (const field of fields) {
          // Element ids containing the property value
          const elementIds = singleContent.primaryKeys.map((key: InstanceKey) => key.id);
          // Value of the field
          const propertyValue = singleContent.displayValues[field.name];
          const parsedValue = this._parseDisplayValue(propertyValue);
          if (field.isPropertiesField()) {
            // Property name, normally should only be one property here
            for (const property of field.properties) {
              const propertyName = property.property.name;
              // Store property data in memory
              for (const elementId of elementIds) {
                const elemProps: Map<string, PropertyData> =
                  this._propertyMap.get(elementId) ??
                  new Map<string, PropertyData>();
                const currentData: PropertyData = elemProps.get(
                  propertyName,
                ) ?? { newValue: undefined, oldValue: undefined };
                // Populate proper value in Property Data
                if (isNew) {
                  currentData.newValue = currentData.newValue ?? parsedValue;
                } else {
                  currentData.oldValue = currentData.oldValue ?? parsedValue;
                }
                // Update maps with new data
                elemProps.set(propertyName, currentData);
                this._propertyMap.set(elementId, elemProps);
              }
            }
          }
        }
      }
    }
  };

  /** Split entries into arrays by opcode */
  private _getSplitEntries = (entries: ChangedElementEntry[]): SplitEntries => {
    const deletedEntries: ChangedElementEntry[] = [];
    const addedEntries: ChangedElementEntry[] = [];
    const modifiedEntries: ChangedElementEntry[] = [];

    for (const entry of entries) {
      if (entry.opcode === DbOpcode.Delete) {
        deletedEntries.push(entry);
      } else if (entry.opcode === DbOpcode.Update) {
        modifiedEntries.push(entry);
      } else {
        addedEntries.push(entry);
      }
    }

    return { deletedEntries, modifiedEntries, addedEntries };
  };

  /** Loads given entries in bulk */
  private _loadBulkProperties = async (
    iModel: IModelConnection,
    entries: ChangedElementEntry[],
    isNew: boolean,
    progressKey: string,
  ): Promise<void> => {
    const chunkSize = 300;
    const numQueries = entries.length / chunkSize;

    // Sort by class Id so that requests contain similar classes
    const sortedEntries = entries.sort(
      (a: ChangedElementEntry, b: ChangedElementEntry) => {
        return a.classId.localeCompare(b.classId);
      },
    );

    for (let i = 0; i < sortedEntries.length; i += chunkSize) {
      const percentage = Math.floor((i / chunkSize / numQueries) * 100);
      this._reportProgress(
        IModelApp.localization.getLocalizedString(
          "VersionCompare:report." + progressKey,
        ) + ` (${percentage}%)`,
      );

      const end = Math.min(i + chunkSize, sortedEntries.length);
      const chunk = sortedEntries.slice(i, end);
      await this._loadProperties(iModel, chunk, isNew);
    }
  };

  /** Gets the entries for an iModel by putting together [added and modified] or [deleted and modified] entries */
  private _getEntriesForIModel = (
    split: SplitEntries,
    isNew?: boolean,
  ): ChangedElementEntry[] => {
    const entries: ChangedElementEntry[] = [];

    // Do it in for loops because spread operator fails for very long arrays
    if (isNew) {
      for (const entry of split.addedEntries) {
        entries.push(entry);
      }
    } else {
      for (const entry of split.deletedEntries) {
        entries.push(entry);
      }
    }

    for (const entry of split.modifiedEntries) {
      entries.push(entry);
    }

    return entries;
  };

  /** Load properties in bulk by chunking up the load */
  private _loadAllProperties = async (entries: ChangedElementEntry[]): Promise<void> => {
    // Split queries into opcode types
    const split = this._getSplitEntries(entries);
    // Get entries that have to be queried on each iModel
    const currentIModelEntries = this._getEntriesForIModel(split, true);
    const targetIModelEntries = this._getEntriesForIModel(split, false);
    // Load properties of current iModel
    if (this._manager.currentIModel) {
      await this._loadBulkProperties(
        this._manager.currentIModel,
        currentIModelEntries,
        true,
        "queryingNewProperties",
      );
    }
    if (this._manager.targetIModel) {
      // Load properties of target iModel
      await this._loadBulkProperties(
        this._manager.targetIModel,
        targetIModelEntries,
        false,
        "queryingOldProperties",
      );
    }
  };

  /** Gets a data row for the changed element entry */
  private _getRow = (entry: ChangedElementEntry): string => {
    return (
      this._cleanComma(entry.id) +
      "," +
      this._cleanComma(this._nativeIdMap?.get(entry.id) ?? "") +
      "," +
      this._cleanComma(entry.label ?? "") +
      "," +
      this._cleanComma(entry.classFullName ?? "") +
      "," +
      this._getElementType(entry.elementType) +
      "," +
      this._getChangeType(entry.opcode) +
      "," +
      (this._options.wantTypeOfChange
        ? this._getTypeOfChange(TypeOfChange.Geometry, entry.type) +
        "," +
        this._getTypeOfChange(TypeOfChange.Placement, entry.type) +
        "," +
        this._getTypeOfChange(
          TypeOfChange.Property | TypeOfChange.Indirect,
          entry.type,
        ) +
        "," +
        this._getTypeOfChange(TypeOfChange.Hidden, entry.type) +
        ","
        : "") +
      entry.modelId +
      "," +
      (entry.indirect ? "True" : "False") +
      "," +
      // Append properties if necessary
      (this._wantProperties() ? this._getPropertyRows(entry) : "") +
      this._cleanComma(JSON.stringify(entry.children) ?? "") +
      "\n"
    );
  };

  /** Get the row of properties for this entry */
  private _getPropertyRows = (entry: ChangedElementEntry): string => {
    const props = this._getSortedProperties();
    let data = "";

    // Get property name-values map using entry's element id
    const propertyMap = this._propertyMap.get(entry.id);
    // Create string of values separated by commas
    for (const prop of props) {
      data +=
        this._cleanComma(propertyMap?.get(prop.propertyName)?.newValue ?? "") +
        ",";
      data +=
        this._cleanComma(propertyMap?.get(prop.propertyName)?.oldValue ?? "") +
        ",";
    }

    return data;
  };

  /** Properties sorted by label */
  private _getSortedProperties = (): ReportProperty[] => {
    if (this._sortedProperties === undefined) {
      if (!this._wantProperties()) {
        return [];
      }

      this._sortedProperties =
        this._options.properties?.sort(
          (a: ReportProperty, b: ReportProperty) => {
            return a.label.localeCompare(b.label);
          },
        ) ?? [];
    }
    return this._sortedProperties;
  };

  /** Gets the header column names for properties */
  private _getPropertyHeader(): string {
    const props = this._getSortedProperties();
    if (props.length === 0) {
      return "";
    }

    const propRows: string[] = [];
    for (const prop of props) {
      propRows.push("New - " + prop.label);
      propRows.push("Old - " + prop.label);
    }

    return propRows
      .reduce((prev: string, current: string) => prev + "," + current, "")
      .substr(1);
  }

  /** Get CSV header */
  private _getHeader(): string {
    return (
      "Element Id,Native Id,Label,Class,Element Type,Change," +
      (this._options.wantTypeOfChange
        ? "Geometric,Placement,Property,Hidden,"
        : "") +
      "Model Id,Indirect," +
      (this._wantProperties() ? this._getPropertyHeader() + "," : "") +
      "Children Ids,\n"
    );
  }

  /**
   * Builds the report asynchronously
   * Returns true if report was created successfully
   */
  protected _buildReport = async (): Promise<string> => {
    // Reset report data
    let reportData = "";

    try {
      this._reportProgress(
        IModelApp.localization.getLocalizedString("VersionCompare:report.loadingEntries"),
      );
      const entries = await this._getEntries();

      // Load all necessary properties
      if (
        this._options.properties !== undefined &&
        this._options.properties.length !== 0
      ) {
        await this._loadAllProperties(entries);
      }

      // Load all native Ids if they exist
      try {
        await this._loadAllNativeIds(entries);
      } catch (e) {
        this._reportProgress(
          IModelApp.localization.getLocalizedString("VersionCompare:report.noNativeIdsFound"),
        );
      }

      // Add change report
      reportData += this._getHeader();
      for (const entry of entries) {
        reportData += this._getRow(entry);
      }

      this._reportProgress(
        IModelApp.localization.getLocalizedString("VersionCompare:report.success"),
      );
    } catch (e) {
      const error = IModelApp.localization.getLocalizedString("VersionCompare:report.failure") + `:${e as string}`;
      this._reportProgress(error);
      // Throw for parent to catch it as a failure
      throw new Error(error);
    }

    return reportData;
  };
}

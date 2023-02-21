/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ModalDialogManager } from "@itwin/appui-react";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@itwin/core-frontend";
import {
  Dialog, DialogButtonStyle, DialogButtonType, Input, LoadingSpinner, SearchBox, ThemedSelect, ThemedSelectProps, Toggle
} from "@itwin/core-react";
import { Checkbox } from "@itwin/itwinui-react";
import * as React from "react";
import type { CellProps } from "react-table";

import { ModelReportGenerator } from "../api/ModelReportGenerator";
import { ReportGenerator, ReportGeneratorBase, type ReportProperty } from "../api/ReportGenerator";
import { VersionCompareManager } from "../api/VersionCompareManager";
import { PropertyLabelCache } from "./PropertyLabelCache";
import "./ReportGeneratorDialog.scss";
import { Table } from "./Table";

/** Makes sure that we are not letting the user start multiple reports in parallel to avoid overwhelming backend with requests */
let reportBeingGenerated = false;

interface ReportPropertyWithExport extends ReportProperty {
  wantExport: boolean;
}

enum ReportType {
  ChangedElements,
  ChangedModels,
}

/** For use in ThemedSelect component */
interface SelectOptions {
  value: ReportType;
  label: string;
}

/** State for the dialog class */
interface ReportGeneratorDialogState {
  /** Name of the file to save report to */
  name: string;
  /** All available properties to select */
  availableProperties: ReportPropertyWithExport[];
  /** Whether to export the current view filtered nodes (or search) */
  onlyExportVisibleChanges: boolean;
  /** Which type of report being generated */
  reportType: ReportType;
  /** Whether we are loading property labels before showing dialog */
  loading: boolean;
  /** Property search string in search box */
  propertySearchString: string;
}

/** Props for change report dialog */
export interface ReportGeneratorDialogProps {
  /** Version Compare Manager that is currently active */
  manager: VersionCompareManager;
  /** Properties to pre-select in the dialog */
  initialProperties?: ReportProperty[];
}

/** Dialog component for doing change report generation in version compare */
export class ReportGeneratorDialog extends React.Component<
  ReportGeneratorDialogProps,
  ReportGeneratorDialogState
> {
  /** Constructor */
  constructor(props: ReportGeneratorDialogProps) {
    super(props);

    this.state = {
      loading: true,
      name: "ChangeReport",
      availableProperties: [],
      reportType: ReportType.ChangedElements,
      propertySearchString: "",
      onlyExportVisibleChanges: false,
    };
  }

  public override async componentDidMount() {
    const propertyNames =
      this.props.manager.changedElementsManager.getAllChangedPropertyNames();
    const properties = [...propertyNames].map((prop: string) => ({
      propertyName: prop,
      classId: "",
    }));
    // Load labels
    if (this.props.manager.currentIModel) {
      await PropertyLabelCache.loadLabels(
        this.props.manager.currentIModel,
        properties,
      );
    }
    const wantedProperties: Set<string> = new Set<string>(
      this.props.initialProperties?.map((prop: ReportProperty) => prop.propertyName),
    );
    const availableProperties: ReportPropertyWithExport[] = [...propertyNames]
      .map((propertyName: string) => ({
        propertyName,
        label: PropertyLabelCache.getLabel("", propertyName) ?? propertyName,
        wantExport: wantedProperties.has(propertyName),
      }))
      .sort((a: ReportPropertyWithExport, b: ReportPropertyWithExport) => {
        return b.label.localeCompare(a.label);
      });
    // Loading finished
    this.setState({
      loading: false,
      availableProperties,
    });
  }

  /**
   * Returns the wanted properties based on the current enabled map and the available properties
   */
  private _getWantedProperties = (): ReportProperty[] => {
    const wantedProperties: ReportProperty[] = [];
    for (const prop of this.state.availableProperties) {
      if (prop.wantExport) {
        wantedProperties.push(prop);
      }
    }
    return wantedProperties;
  };

  /** Handle closing the dialog */
  private _handleClose = () => {
    ModalDialogManager.closeDialog();
  };

  /** Builds and downloads the report using the given generator */
  private _generateReport = async (generator: ReportGeneratorBase) => {
    const success = await generator.buildReport();
    if (success) {
      // Download report and notify user
      generator.downloadReport();
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Info,
          IModelApp.localization.getLocalizedString("VersionCompare:report.generatedSuccessful_brief"),
        ),
      );
    } else {
      // Notify something went wrong
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          IModelApp.localization.getLocalizedString("VersionCompare:report.generatedError_brief"),
        ),
      );
    }
  };

  /** Report Generator factory */
  private _createReportGenerator(reportType: ReportType): ReportGeneratorBase {
    switch (reportType) {
      case ReportType.ChangedElements:
        return new ReportGenerator(this.props.manager, {
          wantInfoHeader: true,
          appendInfoToFilename: false,
          wantTypeOfChange: this.props.manager.wantTypeOfChange,
          properties: this._getWantedProperties(),
          filename: this.state.name.length === 0 ? undefined : this.state.name,
          exportOnlyVisible: this.state.onlyExportVisibleChanges,
        });

      case ReportType.ChangedModels:
        return new ModelReportGenerator(this.props.manager, {
          wantInfoHeader: true,
          appendInfoToFilename: false,
          filename: this.state.name.length === 0 ? undefined : this.state.name,
        });
    }
  }

  /** Handle pressing OK and generating the report */
  private _handleOk = async () => {
    // Ensure no new reports can be triggered again while waiting for one
    reportBeingGenerated = true;

    // Close the dialog
    ModalDialogManager.closeDialog();

    // Notify user process will take a bit
    IModelApp.notifications.outputMessage(
      new NotifyMessageDetails(
        OutputMessagePriority.Info,
        IModelApp.localization.getLocalizedString("VersionCompare:report.generating_brief"),
        IModelApp.localization.getLocalizedString("VersionCompare:report.generating_detailed"),
      ),
    );

    // Create the necessary report generator
    const generator = this._createReportGenerator(this.state.reportType);
    // Generate the report and download
    await this._generateReport(generator);

    // We are done generating a report
    reportBeingGenerated = false;
  };

  /** Handle filename changes */
  private _handleFilenameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({
      name: event.currentTarget.value,
    });
  };

  /** Handle toggle for exporting only visible changes and not ALL changes */
  private _onExportVisibleToggle = (value: boolean) => {
    this.setState({
      onlyExportVisibleChanges: value,
    });
  };

  /** Checkbox for property header */
  private _renderPropertyHeaderCheckbox = () => {
    let allShown = true;
    for (const prop of this.state.availableProperties) {
      allShown = allShown && prop.wantExport;
    }

    // On change, change wantExport on all properties accordingly
    const onChange = () => {
      const newProps = [...this.state.availableProperties];
      for (const prop of newProps) {
        prop.wantExport = !allShown;
      }
      this.setState({
        availableProperties: newProps,
      });
    };

    return <Checkbox checked={allShown} onChange={onChange} />;
  };

  /** Render table for properties to be selected by user */
  private _renderPropertyTable = () => {
    const onPropertyClick = (property: ReportProperty, value: boolean) => {
      const properties = [...this.state.availableProperties];
      for (const prop of properties) {
        if (prop.propertyName === property.propertyName) {
          prop.wantExport = value;
        }
      }
      this.setState({
        availableProperties: properties,
      });
    };

    // columns in the table
    const columns = [
      {
        Header: "Name",
        columns: [
          {
            accessor: "visible",
            id: "visibility",
            align: "center",
            width: 15,
            disableSortBy: true,
            Header: () => {
              return this._renderPropertyHeaderCheckbox();
            },
            Cell: (props: CellProps<ReportPropertyWithExport>) => {
              return (
                <Checkbox
                  checked={props.row.original.wantExport}
                  onChange={() => {
                    onPropertyClick(
                      props.row.original,
                      !props.row.original.wantExport,
                    );
                  }}
                />
              );
            },
          },
          {
            Header: IModelApp.localization.getLocalizedString("VersionCompare:report.changedProperties"),
            accessor: "label",
            id: "label",
            filter: "includes",
            Cell: (props: CellProps<ReportProperty>) => {
              return <>{props.row.original.label}</>;
            },
          },
        ],
      },
    ];

    return (
      <Table<ReportProperty>
        columns={columns}
        data={this.state.availableProperties}
        columnSortBy={[{ id: "name", desc: false }]}
        searchText={this.state.propertySearchString}
      />
    );
  };

  private _getValidReportTypeOptions = (): SelectOptions[] => {
    return [
      {
        label: IModelApp.localization.getLocalizedString("VersionCompare:report.changedElements"),
        value: ReportType.ChangedElements,
      },
      {
        label: IModelApp.localization.getLocalizedString("VersionCompare:report.changedModels"),
        value: ReportType.ChangedModels,
      },
    ];
  };

  private _getCurrentReportTypeOption = (): SelectOptions | undefined => {
    const options = this._getValidReportTypeOptions();
    for (const option of options) {
      if (this.state.reportType === option.value) {
        return option;
      }
    }
    return undefined;
  };

  private _onReportTypeChange: ThemedSelectProps["onChange"] = (option) => {
    this.setState({
      reportType: (option as SelectOptions).value,
    });
  };

  private _handleSearchBox = (value: string) => {
    this.setState({
      propertySearchString: value,
    });
  };

  public override render() {
    return (
      <Dialog
        title={IModelApp.localization.getLocalizedString("VersionCompare:report.changeReport")}
        opened={true}
        width={"500px"}
        onClose={this._handleClose}
        buttonCluster={[
          {
            type: DialogButtonType.OK,
            buttonStyle: DialogButtonStyle.Blue,
            onClick: this._handleOk,
            disabled: this.state.loading,
          },
          {
            type: DialogButtonType.Cancel,
            onClick: this._handleClose,
          },
        ]}
      >
        {this.state.loading ? (
          <LoadingSpinner />
        ) : (
          <div className="change-report-dialog">
            <div className="change-report-dialog-row">
              <div className="change-report-dialog-row-label">
                {IModelApp.localization.getLocalizedString("VersionCompare:report.filename")}
              </div>
              <Input
                defaultValue={this.state.name}
                className="change-report-text-area-2"
                onChange={this._handleFilenameChange}
              />
            </div>
            <div className="change-report-dialog-row">
              <div className="change-report-dialog-row-label">
                {IModelApp.localization.getLocalizedString("VersionCompare:report.reportType")}
              </div>
              <ThemedSelect
                className="change-report-select-type"
                value={this._getCurrentReportTypeOption()}
                options={this._getValidReportTypeOptions()}
                onChange={this._onReportTypeChange}
              />
            </div>
            {this.state.reportType === ReportType.ChangedElements && (
              <>
                <div className="change-report-dialog-row">
                  <SearchBox
                    className="change-report-property-search"
                    onValueChanged={this._handleSearchBox}
                    valueChangedDelay={250}
                    onClear={() => this._handleSearchBox("")}
                  />
                </div>
                <div className="change-report-dialog-property-table">
                  {this._renderPropertyTable()}
                </div>
                <div className="change-report-dialog-row">
                  <Toggle
                    className="change-report-dialog-toggle"
                    title={IModelApp.localization.getLocalizedString("VersionCompare:report.onlyVisibleTooltip")}
                    onChange={this._onExportVisibleToggle}
                  />
                  <div className="change-report-dialog-row-toggle-label">
                    {IModelApp.localization.getLocalizedString("VersionCompare:report.onlyVisible")}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    );
  }
}

/** Opens the Change Report Generation Dialog if no reports are in progress */
export const openReportGeneratorDialog = (
  manager: VersionCompareManager,
  properties?: ReportProperty[],
) => {
  if (reportBeingGenerated) {
    // Notify something went wrong
    IModelApp.notifications.outputMessage(
      new NotifyMessageDetails(
        OutputMessagePriority.Error,
        IModelApp.localization.getLocalizedString("VersionCompare:report.reportInProgressError_brief"),
      ),
    );
    return;
  }

  // Open dialog
  ModalDialogManager.openDialog(<ReportGeneratorDialog manager={manager} initialProperties={properties} />);
};

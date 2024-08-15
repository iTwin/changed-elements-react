import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ChangedElementEntry } from "../api/ChangedElementEntryCache";
import { FilterOptions } from "../SavedFiltersManager";
import { ReactElement, SetStateAction, useState } from "react";
import { AdvancedFilterDialog, PropertyFilter } from "../dialogs/AdvancedFiltersDialog";
import { VersionCompare } from "../api/VersionCompare";
import { PropertyLabelCache } from "../dialogs/PropertyLabelCache";
import { Logger } from "@itwin/core-bentley";
import { Button, Checkbox, DropdownButton, IconButton, MenuDivider, MenuItem, Modal, ModalButtonBar, ModalContent, ToggleSwitch } from "@itwin/itwinui-react";
import { TypeOfChange } from "@itwin/core-common";
import { ExpandableSearchBar } from "../common/ExpandableSearchBar/ExpandableSearchBar";
import { SvgVisibilityHalf, SvgVisibilityHide, SvgVisibilityShow } from "@itwin/itwinui-icons-react";

interface FilterHeaderProps {
  entries: ChangedElementEntry[];
  onFilterChange: (options: FilterOptions) => void;
  onLoadLabels?: (done: boolean) => void;
  onShowAll?: () => Promise<void>;
  onHideAll?: () => Promise<void>;
  onInvert?: () => Promise<void>;
  options: FilterOptions;
  wantTypeOfChange?: boolean;
  wantPropertyFiltering?: boolean;
  iModelConnection: IModelConnection | undefined;
  onSearchChanged?: (newFilter: string) => void;
  enableDisplayShowAllHideAllButtons?: boolean;
}

function ChangeTypeFilterHeader(props: FilterHeaderProps): ReactElement {
  const [advancedFilterDialogShown, setAdvancedFilterDialogShown] = useState(false);
  const [advancedFilterDialogData, setAdvancedFilterDialogData] = useState<PropertyFilter[]>();

  /** Handle saving the advanced filter changes. */
  const handleAdvancedFilteringSave = () => {
    const opts = props.options;
    for (const data of advancedFilterDialogData ?? []) {
      opts.wantedProperties.set(data.name, data.visible ?? false);
    }

    setAdvancedFilterDialogShown(false);
    props.onFilterChange(opts);
  };

  /** Handles selected filters. */
  const handleFilterSelected = (filterOptions: FilterOptions) => {
    props.onFilterChange(filterOptions);
  };

  /** Get current filter options. */
  const getCurrentFilterOptions = () => {
    return props.options;
  };

  /** Handle opening the advanced filter property dialog. */
  const openAdvancedFilterDialog = async () => {
    VersionCompare.manager?.featureTracking?.trackAdvancedFiltersUsage();
    try {
      if (props.onLoadLabels) {
        props.onLoadLabels(false);
      }

      // Create PropertyFilter data for the dialog to use
      const data: PropertyFilter[] = [];
      for (const pair of props.options.wantedProperties) {
        const name = pair[0];
        const visible = pair[1];
        const ids: string[] = [];
        const classIds: string[] = [];
        for (const entry of props.entries) {
          if (entry.properties?.has(name)) {
            ids.push(entry.id);
            classIds.push(entry.classId);
          }
        }

        data.push({
          name,
          classId: classIds[0], // TODO: Figure out how to handle multiple class ids?
          visible,
          ids,
        });
      }

      const properties = data.map(({ name, classId }) => ({ propertyName: name, classId }));
      // Preload property labels
      if (!PropertyLabelCache.allLoaded(properties) && props.iModelConnection) {
        await PropertyLabelCache.loadLabels(props.iModelConnection, properties);
      }

      // Add labels to data and sort by label
      const finalData = data
        .map((filter) => {
          return {
            ...filter,
            label: PropertyLabelCache.getLabel(filter.classId, filter.name) ?? filter.name,
          };
        })
        .sort((a, b) => b.label?.localeCompare(a.label ?? "") ?? 0);

      props.onLoadLabels?.(true);

      setAdvancedFilterDialogData(finalData);
      setAdvancedFilterDialogShown(true);
    } catch (e) {
      // Ensure that if something fails, we let the consumer know we are 'done' loading
      Logger.logError(VersionCompare.logCategory, "Advanced Dialog Opening Error: " + (e as string));
      props.onLoadLabels?.(true);
    }
  };

  type BooleanFields<T> = keyof { [K in keyof T as T[K] extends boolean ? K : never]: T[K] };

  const handleToggle = (optionName: BooleanFields<FilterOptions>) => {
    // todo make options the same between the internal state and the props
    const options = props.options;
    options[optionName] = !options[optionName];
    const newOptions: FilterOptions={...options};
    props.onFilterChange(options);
    props.options = newOptions;
  };

  const legendButtonItems = (close: () => void): JSX.Element[] => [
    <div key="filter-dropdown" className="vc-filter-header-dropdown">
      <ToggleSwitch
        key="unchanged"
        className="vc-color-toggle vc-unchanged"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.unchanged")}
        labelPosition="right"
        defaultChecked={options.wantUnchanged}
        onChange={() => handleToggle("wantUnchanged")}
      />
      <ToggleSwitch
        key="added"
        className="vc-color-toggle vc-added"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.added")}
        labelPosition="right"
        checked={options.wantAdded}
        onChange={() => handleToggle("wantAdded")}
      />
      <ToggleSwitch
        key="removed"
        className="vc-color-toggle vc-deleted"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.removed")}
        labelPosition="right"
        checked={options.wantDeleted}
        onChange={() => handleToggle("wantDeleted")}
      />
      <ToggleSwitch
        key="modified"
        className="vc-color-toggle vc-modified"
        label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.modified")}
        labelPosition="right"
        checked={options.wantModified}
        onChange={() => handleToggle("wantModified")}
      />
      {
        options.wantModified &&
        <>
          <MenuDivider />
          {renderTypeOfChangeMenu(close)}
        </>
      }
    </div>,
  ];

  const renderTypeOfChangeMenu = (close?: () => void) => {
    const makeContextMenuItem = (localeStr: string, flag: number) => {
      const isOn = (props.options.wantedTypeOfChange & flag) !== 0;
      return (
        <Checkbox
          key={localeStr}
          label={IModelApp.localization.getLocalizedString(`VersionCompare:typeOfChange.${localeStr}`)}
          checked={isOn}
          onClick={() => {
            const opts = props.options;
            opts.wantedTypeOfChange = isOn ? opts.wantedTypeOfChange & ~flag : opts.wantedTypeOfChange | flag;
            props.onFilterChange(opts);
          }}
        />
      );
    };

    return (
      <>
        {makeContextMenuItem("geometry", TypeOfChange.Geometry)}
        {makeContextMenuItem("placement", TypeOfChange.Placement)}
        {makeContextMenuItem("property", TypeOfChange.Property | TypeOfChange.Indirect)}
        {makeContextMenuItem("hiddenProperty", TypeOfChange.Hidden)}
        {props.wantPropertyFiltering && <div className="vc-context-menu-separator" />}
        {
          props.wantPropertyFiltering &&
          <MenuItem
            key={"AdvancedPropFilterKey"}
            onClick={async () => {
              // Close context menu
              close?.();
              // Open advanced filter dialog
              await openAdvancedFilterDialog();
            }}
          >
            {IModelApp.localization.getLocalizedString("VersionCompare:typeOfChange.advancedFiltering")}
          </MenuItem>
        }
      </>
    );
  };

  // For now, re-order toggles so that extra modified menu is at the right
  return (
    <div className="filter-header">
      <Modal
        title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.settingsTitle")}
        isOpen={advancedFilterDialogShown}
        style={{ width: "40%", minWidth: 500, minHeight: 400 }}
        onClose={() => setAdvancedFilterDialogShown(false)}
      >
        <ModalContent>
          <AdvancedFilterDialog
            data={advancedFilterDialogData ?? []}
            setData={setAdvancedFilterDialogData as (args: SetStateAction<PropertyFilter[]>) => void}
            showValues={false}
            onFilterSelected={handleFilterSelected}
            getCurrentFilterOptions={getCurrentFilterOptions}
          />
        </ModalContent>
        <ModalButtonBar>
          <Button styleType="high-visibility" onClick={handleAdvancedFilteringSave}>
            {IModelApp.localization.getLocalizedString("VersionCompare:filters.apply")}
          </Button>
          <Button onClick={() => setAdvancedFilterDialogShown(false)}>
            {IModelApp.localization.getLocalizedString("UiCore:dialog.cancel")}
          </Button>
        </ModalButtonBar>
      </Modal>
      <ExpandableSearchBar
        size="small"
        styleType="borderless"
        setFocus={true}
        valueChangedDelay={500}
        onChange={props.onSearchChanged}
      >
        {(props.enableDisplayShowAllHideAllButtons || props.enableDisplayShowAllHideAllButtons === undefined) && <>
          <IconButton
            size="small"
            styleType="borderless"
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.showAll")}
            onClick={props.onShowAll}
          >
            <SvgVisibilityShow />
          </IconButton>
          <IconButton
            size="small"
            styleType="borderless"
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.hideAll")}
            onClick={props.onHideAll}
          >
            <SvgVisibilityHide />
          </IconButton>
          <IconButton
            size="small"
            styleType="borderless"
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.invertDisplay")}
            onClick={props.onInvert}
          >
            <SvgVisibilityHalf />
          </IconButton>
          <div className="filter-header-separator" />
        </>}
        <DropdownButton size="small" menuItems={legendButtonItems}>
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.filter")}
        </DropdownButton>
      </ExpandableSearchBar>
    </div>
  );
}

export default ChangeTypeFilterHeader;

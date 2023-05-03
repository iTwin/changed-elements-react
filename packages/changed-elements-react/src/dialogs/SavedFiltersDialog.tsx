/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@itwin/core-frontend";
import { ContextMenu, ContextMenuDirection, ContextMenuItem, Icon } from "@itwin/core-react";
import { SvgMore } from "@itwin/itwinui-icons-react";
import { IconButton, Input } from "@itwin/itwinui-react";
import { CSSProperties, ReactElement, useEffect, useMemo, useState } from "react";
import { CellProps } from "react-table";

import { FilterData, SavedFiltersManager } from "../SavedFiltersManager.js";
import { Table } from "./Table.js";

import "./SavedFiltersDialog.scss";

interface SavedFilterContextMenuProps {
  data: FilterData;
  savedFilters: SavedFiltersManager;
  onStartRename: (data: FilterData) => void;
}

/** 'More' button for a filter with options to share and delete. */
const SavedFilterContextMenuButton = (props: SavedFilterContextMenuProps) => {
  const { data, savedFilters, onStartRename } = props;
  const [opened, setOpened] = useState(false);

  const onOutsideClick = () => {
    setOpened(false);
  };

  const onShare = async () => {
    if (data.editable) {
      const sharing = !data.shared;
      const success = await savedFilters.updateFilter(data, sharing, data.filter);
      if (success) {
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Info,
            IModelApp.localization.getLocalizedString(
              sharing ? "VersionCompare:filters.shareSuccessful" : "VersionCompare:filters.unshareSuccessful",
            ),
          ),
        );
      } else {
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Error,
            IModelApp.localization.getLocalizedString(
              sharing ? "VersionCompare:filters.shareError" : "VersionCompare:filters.unshareError",
            ),
          ),
        );
      }
    }

    setOpened(false);
  };

  const onDelete = async () => {
    if (data.editable) {
      const success = await savedFilters.deleteFilter(data);
      if (success) {
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Info,
            IModelApp.localization.getLocalizedString("VersionCompare:filters.deleteSuccess"),
          ),
        );
      } else {
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Error,
            IModelApp.localization.getLocalizedString("VersionCompare:filters.deleteError"),
          ),
        );
      }
    }

    setOpened(false);
  };

  const renameHandler = () => {
    if (data.editable) {
      onStartRename(data);
    }

    setOpened(false);
  };

  const openMenu = () => {
    setOpened(true);
  };

  return (
    <>
      <IconButton onClick={openMenu} styleType="borderless"><SvgMore /></IconButton>
      <ContextMenu
        opened={opened}
        onOutsideClick={onOutsideClick}
        direction={ContextMenuDirection.BottomLeft}
      >
        <ContextMenuItem icon="icon-edit" key={0} onClick={renameHandler}>
          {IModelApp.localization.getLocalizedString("VersionCompare:filters.rename")}
        </ContextMenuItem>
        <ContextMenuItem icon="icon-share" key={1} onClick={onShare}>
          {IModelApp.localization.getLocalizedString(
            data.shared ? "VersionCompare:filters.unshare" : "VersionCompare:filters.share",
          )}
        </ContextMenuItem>
        <ContextMenuItem icon="icon-delete" key={2} onClick={onDelete}>
          {IModelApp.localization.getLocalizedString("VersionCompare:filters.delete")}
        </ContextMenuItem>
      </ContextMenu>
    </>
  );
};

export interface EditableFilterNameProps {
  data: FilterData;
  savedFilters: SavedFiltersManager;
  renaming: boolean;
  onRenamed: () => void;
}

/** Used to display the filter name in the table and provide an editable field for renaming the filter. */
export function EditableFilterName(props: EditableFilterNameProps): ReactElement {
  const { data, savedFilters, renaming, onRenamed } = props;
  const [disableRenameInput, setDisableRenameInput] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>(data.name);

  // Rename the filter based on the renameId and the newName
  const renameFilter = async () => {
    setDisableRenameInput(true);
    try {
      if (data.editable) {
        const success = await savedFilters.renameFilter(data, newName);
        if (success) {
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(
              OutputMessagePriority.Info,
              IModelApp.localization.getLocalizedString("VersionCompare:filters.renameSuccessful"),
            ),
          );
        } else {
          IModelApp.notifications.outputMessage(
            new NotifyMessageDetails(
              OutputMessagePriority.Error,
              IModelApp.localization.getLocalizedString("VersionCompare:filters.renameError"),
            ),
          );
        }
      }
    } catch {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          IModelApp.localization.getLocalizedString("VersionCompare:filters.renameError"),
        ),
      );
    }

    setDisableRenameInput(false);
    setNewName("");
    onRenamed();
  };

  const onRenameInputChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(event.target.value ?? "");
  };

  const onRenameInputBlur = () => {
    renameFilter().catch(() => { });
  };

  const onRenameInputKeyPressed = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      renameFilter().catch(() => { });
    }
  };

  return renaming
    ? <Input
      className="saved-filters-edit-dialog-input"
      type="string"
      setFocus={true}
      disabled={disableRenameInput}
      value={newName}
      onChange={onRenameInputChanged}
      onBlur={onRenameInputBlur}
      onKeyPress={onRenameInputKeyPressed}
    />
    : <>{data.name}</>;
}

export interface SavedFiltersDialogProps {
  savedFilters: SavedFiltersManager;
  styles?: CSSProperties;
}

/** Dialog to edit and share version compare saved filters. */
export function SavedFiltersTable({ savedFilters, styles }: SavedFiltersDialogProps): ReactElement {
  const [data, setData] = useState<FilterData[]>([]);
  const [renameId, setRenameId] = useState<string | undefined>(undefined);

  useEffect(
    () => {
      // Queries the filters from the cache
      const updateFilters = () => {
        savedFilters
          .getFilters()
          .then((newData) => setData(newData))
          .catch(() => { });
      };
      // Update filter data
      updateFilters();
      // Listen to changes of the cache
      savedFilters.onFiltersChanged.addListener(updateFilters);
      // Cleanup function for listener
      return () => {
        savedFilters.onFiltersChanged.removeListener(updateFilters);
      };
    },
    [savedFilters],
  );

  const onStartRename = (toRename: FilterData) => {
    setRenameId(toRename.id);
  };

  const onRenamed = () => {
    setRenameId(undefined);
  };

  // columns in the table
  const columns = useMemo(
    () => [
      {
        Header: "Name",
        columns: [
          {
            Header: IModelApp.localization.getLocalizedString("VersionCompare:filters.filterName"),
            accessor: "name",
            id: "name",
            filter: "includes",
            Cell: (props: CellProps<FilterData>) => {
              return (
                <EditableFilterName
                  data={props.row.original}
                  savedFilters={savedFilters}
                  renaming={renameId !== undefined && renameId === props.row.original.id}
                  onRenamed={onRenamed}
                />
              );
            },
          },
          {
            Header: IModelApp.localization.getLocalizedString("VersionCompare:filters.shared"),
            accessor: "shared",
            id: "shared",
            align: "center",
            width: 50,
            Cell: (props: CellProps<FilterData>) => {
              if (props.row.original.shared) {
                return <Icon iconSpec="icon-share" />;
              } else {
                return <div />;
              }
            },
          },
          {
            Header: IModelApp.localization.getLocalizedString("VersionCompare:filters.more"),
            id: "moreBtn",
            align: "center",
            width: 30,
            Cell: (props: CellProps<FilterData>) => {
              if (props.row.original.editable) {
                return (
                  <SavedFilterContextMenuButton
                    data={props.row.original}
                    savedFilters={savedFilters}
                    onStartRename={onStartRename}
                  />
                );
              } else {
                return <div />;
              }
            },
          },
        ],
      },
    ],
    [renameId, savedFilters],
  );

  return (
    <div className="saved-filters-edit-dialog-container" style={styles}>
      <Table<FilterData>
        columns={columns}
        data={data}
        columnSortBy={[{ id: "name", desc: false }]}
        searchText=""
      />
    </div>
  );
}

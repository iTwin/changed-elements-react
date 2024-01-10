/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Code, List, ListItem, Text } from "@itwin/itwinui-react";
import { Fragment, ReactElement, memo, useCallback } from "react";

import { Changeset, NamedVersion } from "./NamedVersionSelector";
import { SvgHistory } from "@itwin/itwinui-icons-react";

export interface ChangesetListProps {
  currentChangesetId?: string | undefined;
  changesets: Changeset[];
  namedVersions?: NamedVersion[] | undefined;
  selectedChangesetId?: string | undefined;
  onChangesetSelected?: ((changesetId: string) => void) | undefined;
  actionable?: boolean;
}

export function ChangesetList(props: ChangesetListProps): ReactElement {
  const handleChangesetClicked = useCallback(
    (changeset) => (0, props.onChangesetSelected)?.(changeset.id),
    [props.onChangesetSelected],
  );

  if (props.changesets.length === 0) {
    return (
      <div><SvgHistory /> No changesets</div>
    );
  }

  const currentChangesetIndex = props.changesets.findIndex(({ id }) => id === props.currentChangesetId);
  const currentChangeset: Changeset | undefined = props.changesets[currentChangesetIndex];
  const changesets = props.changesets.slice(currentChangesetIndex + 1);
  const namedVersions = new Map(props.namedVersions?.map((namedVersion) => [namedVersion.changesetId, namedVersion]));
  const currentNamedVersion = (namedVersions as Map<string | undefined, NamedVersion>).get(props.currentChangesetId);
  const baseChangeset = changesets.find(({ id }) => id === props.selectedChangesetId);

  let isRequired = !!baseChangeset;
  return (
    <List className="iTwinChangedElements__changeset-list">
      {currentChangeset && currentNamedVersion && <NamedVersionRow namedVersion={currentNamedVersion} isRequired={isRequired} />}
      {currentChangeset && <ChangesetRow changeset={currentChangeset} current required={!!baseChangeset} />}
      {changesets.filter(changeset=>namedVersions.has(changeset.id)).map((changeset) => {
        const isBase = changeset.id === baseChangeset?.id;
        if (isBase) {
          isRequired = false;
        }
        const namedVersion = namedVersions.get(changeset.id);
        return (
          <Fragment key={changeset.id}>
            {namedVersion && <NamedVersionRow namedVersion={namedVersion} isRequired={isBase || isRequired} />}
            <ChangesetRow
              key={changeset.id}
              changeset={changeset}
              isBase={isBase}
              required={isRequired}
              actionable={props.actionable}
              onClick={handleChangesetClicked}
            />
          </Fragment>
        );
      })}
    </List>
  );
}

interface NamedVersionRowProps {
  namedVersion: NamedVersion;
  isRequired: boolean;
}

function NamedVersionRow(props: NamedVersionRowProps) {
  return (
    <ListItem style={{ paddingBlock: 0 }}>
      <IconStraight required={props.isRequired} />
      <div />
      <Text variant="small">{props.namedVersion.displayName}</Text>
      <div />
    </ListItem>
  );
}

interface ChangesetRowProps {
  changeset: Changeset;
  isBase?: boolean;
  actionable?: boolean;
  required?: boolean;
  current?: boolean;
  onClick?: (changeset: Changeset) => void;
}

const ChangesetRow = memo(
  function ChangesetRow(props: ChangesetRowProps): ReactElement {
    return (
      <ListItem
        className="iTwinChangedElements__changeset-row"
        style={{ paddingBlock: 0 }}
        actionable={props.actionable}
        disabled={props.current}
        active={props.isBase}
        onClick={() => props.onClick?.(props.changeset)}
      >
        {props.changeset.isProcessed ? <IconProcessed required={props.required} /> : <IconUnprocessed required={props.required} />}
        <Code>{props.changeset.id.slice(0, 8)}</Code>
        <Text>{props.changeset.description}</Text>
        {!props.current && <Text></Text>}
        {props.current && <Text>Active version</Text>}
        <div style={{ display: "grid", justifyItems: "end" }}>
          <Text title={props.changeset.date.toLocaleString()}>{formatDate(props.changeset.date)}</Text>
        </div>
      </ListItem>
    );
  },
);


export interface IconProps {
  required?: boolean | undefined;
}

export function IconStraight(props: IconProps): ReactElement {
  return (
    <svg className="iTwinChangedElements__list-icon" data-required={props.required} viewBox="0 0 32 32">
      <path d="M 16 -16 L 16 48" />
    </svg>
  );
}

export function IconUnprocessed(props: IconProps): ReactElement {
  return (
    <svg className="iTwinChangedElements__list-icon" data-required={props.required} viewBox="0 0 32 32">
      <polygon points="16 12 12 16 16 20 20 16" fillOpacity="0" />
      <path d="M 16 -16 L 16 12 M 16 20 L 16 48" />
    </svg>
  );
}

export function IconProcessed(props: IconProps): ReactElement {
  return (
    <svg className="iTwinChangedElements__list-icon" data-required={props.required} viewBox="0 0 32 32">
      <polygon points="16 12 12 16 16 20 20 16" />
      <path d="M 16 -16 L 16 12 M 16 20 L 16 48" />
    </svg>
  );
}

function formatDate(date: Date): string {
  const relativeTimeFormat = new Intl.RelativeTimeFormat();
  let difference = date.getTime() - Date.now();
  difference /= 1000;
  if (Math.abs(difference) < 60) {
    return relativeTimeFormat.format(Math.trunc(difference), "second");
  }

  difference /= 60;
  if (Math.abs(difference) < 60) {
    return relativeTimeFormat.format(Math.trunc(difference), "minute");
  }

  difference /= 60;
  if (Math.abs(difference) < 24) {
    return relativeTimeFormat.format(Math.trunc(difference), "hour");
  }

  difference /= 24;
  if (Math.abs(difference) < 30) {
    return relativeTimeFormat.format(Math.trunc(difference), "day");
  }

  difference /= 30;
  if (Math.abs(difference) < 4) {
    return relativeTimeFormat.format(Math.trunc(difference), "month");
  }

  return Intl.DateTimeFormat().format(date);
}

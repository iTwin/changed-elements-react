/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgChevronDown, SvgChevronRight, SvgSearch } from "@itwin/itwinui-icons-react";
import { Button, Code, IconButton, List, ListItem, Text } from "@itwin/itwinui-react";
import { Fragment, ReactElement, useState } from "react";

import { IconProcessed, IconStraight, IconUnprocessed } from "./ChangesetList.js";

import "./VersionSelector.css";

export interface NamedVersion {
  id: string;
  changesetId: string;
  displayName: string;
  description: string;
  date: string;
}

export interface Changeset {
  id: string;
  description: string;
  date: Date;
  isProcessed: boolean;
}

export interface NamedVersionSelectorProps {
  currentNamedVersion: NamedVersionListItem;
  namedVersionList: NamedVersionListItem[];
}

export interface NamedVersionListItem {
  namedVersion: NamedVersion;
  changesets: Changeset[];
}

export function NamedVersionSelector(props: NamedVersionSelectorProps): ReactElement {
  const [expandedNamedVersions, setExpandedNamedVersions] = useState(new Set<string>());

  const handleExpansionToggle = (expanded: boolean, namedVersion: NamedVersion) => {
    setExpandedNamedVersions((prev) => {
      const newExpandedNamedVersions = new Set(prev);
      if (expanded) {
        newExpandedNamedVersions.add(namedVersion.id);
      } else {
        newExpandedNamedVersions.delete(namedVersion.id);
      }

      return newExpandedNamedVersions;
    });
  };

  const [baseChangeset, setBaseChangeset] = useState<string>();

  return (
    <div className="iTwinChangedElements__named-version-selector">
      <div style={{ display: "grid", grid: "1fr / 1fr auto", alignItems: "center" }}>
        <Text variant="leading">Select version for comparison</Text>
        <IconButton styleType="borderless"><SvgSearch /></IconButton>
      </div>
      <List>
        <NamedVersionRow
          namedVersion={props.currentNamedVersion.namedVersion}
          onExpansionToggle={handleExpansionToggle}
          current
        />
        {
          expandedNamedVersions.has(props.currentNamedVersion.namedVersion.id) &&
          props.currentNamedVersion.changesets.map(
            (changeset) => <ChangesetRow key={changeset.id} changeset={changeset} />,
          )
        }
        {
          props.namedVersionList.map(({ namedVersion, changesets }) => {
            return (
              <Fragment key={namedVersion.id}>
                <NamedVersionRow namedVersion={namedVersion} onExpansionToggle={handleExpansionToggle} />
                {
                  expandedNamedVersions.has(namedVersion.id) &&
                  changesets.map((changeset) => <ChangesetRow key={changeset.id} changeset={changeset} />)
                }
              </Fragment>
            );
          })
        }
      </List>
      <div style={{ justifySelf: "end", display: "flex", gap: "var(--iui-size-xs)" }}>
        <Button styleType="high-visibility" disabled={!baseChangeset}>Start comparison</Button>
        <Button>Cancel</Button>
      </div>
    </div>
  );
}

interface NamedVersionRowProps {
  namedVersion: NamedVersion;
  current?: boolean;
  required?: boolean;
  onExpansionToggle: (expanded: boolean, namedVersion: NamedVersion) => void;
}

function NamedVersionRow(props: NamedVersionRowProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  const handleExpansionToggle = () => {
    setExpanded(!expanded);
    props.onExpansionToggle(!expanded, props.namedVersion);
  };

  return (
    <ListItem className="iTwinChangedElements__named-version-row" actionable={!props.current} disabled={props.current}>
      <IconButton styleType="borderless" onClick={handleExpansionToggle}>
        {expanded ? <SvgChevronDown /> : <SvgChevronRight />}
      </IconButton>
      <div>
        <Text>{props.namedVersion.displayName}</Text>
        {
          props.namedVersion.description
            ? <Text variant="small">{props.namedVersion.description}</Text>
            : <Text variant="small" isMuted>No description</Text>
        }
      </div>
      <div>
        <Text>{props.namedVersion.date}</Text>
        {!expanded && <Code>{props.namedVersion.changesetId}</Code>}
      </div>
      {expanded ? <IconStraight /> : <IconUnprocessed />}
    </ListItem>
  );
}

interface ChangesetRowProps {
  changeset: Changeset;
  required?: boolean;
}

function ChangesetRow(props: ChangesetRowProps): ReactElement {
  return (
    <ListItem className="iTwinChangedElements__changeset-row" actionable>
      <Text>{props.changeset.description}</Text>
      <Code>{props.changeset.id}</Code>
      {props.changeset.isProcessed ? <IconProcessed /> : <IconUnprocessed />}
    </ListItem>
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgRefresh, SvgStatusErrorHollow } from "@itwin/itwinui-icons-react";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Code, IconButton, List, ListItem, Surface, Text } from "@itwin/itwinui-react";
import {
  Component, StrictMode, createElement, type PropsWithChildren, type ReactElement, type ReactNode
} from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import {
  ChangesetSelectDialogDemo, ChangesetSelectDialogError, ChangesetSelectDialogLoading, ChangesetSelectDialogNoChangesets
} from "./VersionSelectorDemo/ChangesetSelectorDialogDemo";
import { NamedVersionSelectorDemo } from "./VersionSelectorDemo/NamedVersionSelectorDemo";

import "./ComponentsCatalog.css";

const componentsMap = new Map([
  ["NamedVersionSelectorDemo", [NamedVersionSelectorDemo]],
  [
    "ChangesetSelectDialog",
    [
      ChangesetSelectDialogDemo,
      ChangesetSelectDialogLoading,
      ChangesetSelectDialogNoChangesets,
      ChangesetSelectDialogError,
    ],
  ],
]);

export function ComponentsCatalogRoutes(): ReactElement {
  const [firstCategory, [firstComponent]] = [...componentsMap.entries()][0];
  return (
    <StrictMode>
      <Routes>
        <Route index element={<Navigate to={`${firstCategory}/${firstComponent.name}`} />} />
        <Route path=":category/:component/*" element={<ComponentsCatalog />} />
      </Routes>
    </StrictMode>
  );
}

function ComponentsCatalog(): ReactElement {
  const params = useParams<{ category: string; component: string; }>();

  const currentComponent = componentsMap
    .get(params.category ?? "")
    ?.find((component) => component.name === params.component);

  const navigate = useNavigate();

  return (
    <PageLayout.Content>
      <div className="components-catalog">
        <div className="components-list">
          <Text className="title" variant="leading">Components</Text>
          <List className="list">
            {
              [...componentsMap.keys()].map(
                (component) => (
                  <ListItem
                    key={component}
                    active={component === params.category}
                    onClick={() => navigate(`../${component}/${(componentsMap.get(component) ?? [])[0].name}`)}
                    actionable
                  >
                    {component}
                  </ListItem>
                ),
              )
            }
          </List>
        </div>
        <div className="components-list">
          <Text className="title" variant="leading">Component state</Text>
          <List className="list">
            {
              componentsMap.get(params.category ?? "")?.map(
                (component) => (
                  <ListItem
                    key={component.name}
                    active={component.name === params.component}
                    onClick={() => navigate(`../${params.category}/${component.name}`)}
                    actionable
                  >
                    {component.name}
                  </ListItem>
                ),
              )
            }
          </List>
        </div>
        <div className="playground-side">
          {
            currentComponent
              ? <>
                <PageLayout.TitleArea>
                  <Text variant="title">{currentComponent.name}</Text>
                </PageLayout.TitleArea>
                <div className="playground-area">
                  <ErrorBoundary key={currentComponent.name}>
                    {createElement(currentComponent)}
                  </ErrorBoundary>
                </div>
              </>
              : <Text>Component not found</Text>
          }
        </div>
      </div>
    </PageLayout.Content>
  );
}

interface ErrorBoundaryState {
  error: Error | undefined;
  numErrors: number;
}

class ErrorBoundary extends Component<PropsWithChildren<unknown>, ErrorBoundaryState> {
  constructor(props: PropsWithChildren<unknown>) {
    super(props);

    this.state = {
      error: undefined,
      numErrors: -1,
    };
  }

  public static getDerivedStateFromError(error: Error) {
    return { error };
  }

  public override componentDidUpdate(_prevProps: unknown, prevState: ErrorBoundaryState): void {
    if (this.state.error && prevState.numErrors === this.state.numErrors) {
      this.setState({ numErrors: this.state.numErrors + 1 });
    } else if (this.state.error === undefined && this.state.numErrors !== -1) {
      this.setState({ numErrors: -1 });
    }
  }

  public override render(): ReactNode {
    if (this.state.error) {
      return (
        <Surface className="components-catalog-error">
          <div className="title">
            <div>
              <SvgStatusErrorHollow className="error-icon" />
              <Text variant="title">Component error {this.state.numErrors > 0 ? `(${this.state.numErrors})` : ""}</Text>
            </div>
            <IconButton title="Retry" onClick={() => this.setState({ error: undefined })}><SvgRefresh /></IconButton>
          </div>
          <Code>{this.state.error.stack ? this.state.error.stack : this.state.error.toString()}</Code>
        </Surface>
      );
    }

    return this.props.children;
  }
}

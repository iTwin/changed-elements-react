/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ErrorPage.css";
import { ComponentType, createElement, ReactElement, ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SvgError } from "@itwin/itwinui-illustrations-react";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Button, ExpandableBlock, Title } from "@itwin/itwinui-react";

export interface ErrorPageProps {
  /** Illustration component. Default: {@link SvgError}. */
  illustration?: ComponentType<{ className: string; }>;

  /** Main error title, describing the kind of error that occured. */
  title: string;

  /** Troubleshooting steps, if any. */
  troubleshooting?: ReactNode;

  /** Error description. */
  children: ReactNode;
}

/** An error page with illustration */
export function ErrorPage(props: ErrorPageProps): ReactElement {
  const navigate = useNavigate();
  useEffect(
    () => {
      document.title = `${props.title} - Changed Elements Test App`;
      return () => {
        document.title = "Changed Elements Test App";
      };
    },
    [props.title],
  );

  return (
    <PageLayout.Content className="error-page">
      {createElement(props.illustration ?? SvgError, { className: "error-illustration" })}
      <div className="error-details">
        <Title>{props.title}</Title>
        <span>{props.children}</span>
      </div>
      {
        props.troubleshooting &&
        <ExpandableBlock className="error-troubleshooting" title="Troubleshooting">
          {props.troubleshooting}
        </ExpandableBlock>
      }
      <Button styleType="high-visibility" onClick={() => navigate("/")}>Go to homepage</Button>
    </PageLayout.Content>
  );
}

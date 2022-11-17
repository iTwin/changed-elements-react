/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { SvgDeveloper } from "@itwin/itwinui-icons-react";
import { Button, Header, HeaderLogo, IconButton } from "@itwin/itwinui-react";

export function AppHeader(): ReactElement {
  const navigate = useNavigate();

  const actions = [
    <IconButton
      key="Repository"
      as="a"
      href="https://github.com/iTwin/changed-elements-react"
      title="Source code"
      styleType="borderless"
    >
      <GitHubLogo />
    </IconButton>,
    <Button key="signin" styleType="borderless">Sign In</Button>,
  ];

  return (
    <Header
      appLogo={<HeaderLogo logo={<SvgDeveloper />} onClick={() => navigate("/")}>Changed Elements Test App</HeaderLogo>}
      actions={actions}
    />
  );
}

interface GitHubLogoProps {
  className?: string | undefined;
}

function GitHubLogo(props: GitHubLogoProps): ReactElement {
  return (
    <svg className={props.className} style={{ fill: "#1b1817" }} viewBox="0 0 44 44">
      <path
        d="M21.998.009C9.85.009 0 9.859 0 22.009c0 9.72 6.303 17.966 15.045 20.876 1.101.202 1.502-.478 1.502-1.061 0
-.522-.019-1.906-.03-3.741-6.119 1.329-7.41-2.95-7.41-2.95-1-2.54-2.443-3.217-2.443-3.217-1.998-1.365.15-1.338.15-1.338
2.21.156 3.37 2.267 3.37 2.267 1.963 3.362 5.15 2.39 6.404 1.829.2-1.422.767-2.392 1.396-2.942C13.1 31.177 7.963 29.29
7.963 20.86c0-2.401.858-4.365 2.265-5.903-.227-.557-.982-2.793.215-5.823 0 0 1.847-.591 6.05 2.256a21.071 21.071 0 0 1
5.508-.74c1.868.008 3.75.252 5.507.74 4.2-2.847 6.044-2.256 6.044-2.256 1.2 3.03.446 5.266.219 5.823 1.41 1.538 2.262
3.502 2.262 5.903 0 8.452-5.144 10.312-10.045 10.856.79.68 1.493 2.022 1.493 4.074 0 2.94-.027 5.314-.027 6.035 0 .589
.396 1.273 1.513 1.059C37.702 39.967 44 31.727 44 22.01 44 9.859 34.149.009 21.998.009"
      />
    </svg>
  );
}

/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./App.css";
import { ReactElement, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { SvgUser } from "@itwin/itwinui-icons-react";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Button, Surface } from "@itwin/itwinui-react";
import { AppHeader } from "./AppHeader";
import { initializeITwinJsApp } from "./ITwinJsApp/ITwinJsApp";

export function App(): ReactElement {
  return (
    <PageLayout>
      <PageLayout.Header>
        <AppHeader />
      </PageLayout.Header>
      <Routes>
        <Route path="/*" element={<Main />} />
      </Routes>
    </PageLayout>
  );
}

function Main(): ReactElement {
  useEffect(
    () => {
      void (async () => {
        void initializeITwinJsApp();
      })();
    },
    [],
  );

  return (
    <PageLayout.Content padded>
      <SignInPrompt signIn={() => { }} />
    </PageLayout.Content>
  );
}

interface SignInPromptProps {
  signIn: () => void;
}

function SignInPrompt(props: SignInPromptProps): ReactElement {
  return (
    <div className="signin-prompt">
      <Surface elevation={1}>
        <SvgUser />
        <Button styleType="cta" onClick={props.signIn}>Sign in to continue</Button>
      </Surface>
    </div>
  );
}

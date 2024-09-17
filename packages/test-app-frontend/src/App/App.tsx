/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgUser } from "@itwin/itwinui-icons-react";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Button, Surface, ThemeProvider } from "@itwin/itwinui-react";
import { type ReactElement, useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { applyAuthUrlPrefix, clientId } from "../environment.js";
import { AppContext, appContext } from "./AppContext.js";
import { AppHeader } from "./AppHeader.js";
import {
  AuthorizationProvider, AuthorizationState, SignInCallback, SignInSilent, SignInSilentCallback, useAuthorization
} from "./Authorization.js";
import { LoadingScreen } from "./common/LoadingScreen.js";
import { ErrorPage } from "./errors/ErrorPage.js";
import { IModelBrowser } from "./imodel-browser/IModelBrowser.js";
import { ITwinBrowser } from "./imodel-browser/ITwinBrowser.js";
import type { ITwinJsApp } from "./ITwinJsApp/ITwinJsApp.js";

import "./App.css";

export function App(): ReactElement {
  const [appContextValue, setAppContextValue] = useState<AppContext>({
    theme: "light",
    setTheme: (theme) => setAppContextValue((prev) => ({ ...prev, theme })),
  });

  return (
    <appContext.Provider value={appContextValue}>
      <AuthorizationProvider
        authority={applyAuthUrlPrefix("https://ims.bentley.com")}
        clientId={clientId === "spa-xxxxxxxxxxxxxxxxxxxxxxxxx" ? undefined : clientId}
        redirectUri="/auth/callback"
        silentRedirectUri="/auth/silent"
        postLogoutRedirectUri="/"
        scope="users:read imodels:read imodelaccess:read changedelements:read itwins:read changedelements:modify"
      >
        <ThemeProvider theme={appContextValue.theme}>
          <PageLayout>
            <PageLayout.Header>
              <AppHeader />
            </PageLayout.Header>
            <Routes>
              <Route path="/auth/callback" element={<SignInCallback />} />
              <Route path="/auth/silent" element={<SignInSilentCallback />} />
              <Route path="/*" element={<><SignInSilent /><Main /></>} />
            </Routes>
          </PageLayout>
        </ThemeProvider>
      </AuthorizationProvider>
    </appContext.Provider>
  );
}

function Main(): ReactElement {
  const iTwinJsApp = useBackgroundITwinJsAppLoading();

  const { state, signIn } = useAuthorization();
  if (state === AuthorizationState.Offline) {
    return <SetupEnvHint />;
  }

  if (state === AuthorizationState.Pending) {
    return <LoadingScreen>Checking signin status...</LoadingScreen>;
  }

  if (state === AuthorizationState.SignedOut) {
    return (
      <PageLayout.Content>
        <SignInPrompt signIn={signIn} />
      </PageLayout.Content>
    );
  }

  return (
    <Routes>
      <Route index element={<Navigate replace to="/itwinjs/browse/iTwins" />} />
      <Route path="itwinjs/browse/iTwins">
        <Route index element={<ITwinBrowser />} />
        <Route path=":iTwinId" element={<IModelBrowser />} />
      </Route>
      <Route path="itwinjs/open-imodel/:iTwinId/:iModelId" element={<OpenIModel iTwinJsApp={iTwinJsApp} />} />
    </Routes>
  );
}

function SetupEnvHint(): ReactElement {
  return (
    <ErrorPage title="Configuration error">
      Setup .env.local configuration file in the test-app-frontend directory.
    </ErrorPage>
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

function useBackgroundITwinJsAppLoading(): typeof ITwinJsApp | undefined {
  const [itwinJsApp, setITwinJsApp] = useState<typeof ITwinJsApp>();
  const { authorizationClient } = useAuthorization();
  useEffect(
    () => {
      if (!authorizationClient) {
        return;
      }

      let disposed = false;
      void (async () => {
        const { ITwinJsApp, initializeITwinJsApp } = await import("./ITwinJsApp/ITwinJsApp.js");
        await initializeITwinJsApp(authorizationClient);
        if (!disposed) {
          setITwinJsApp(() => ITwinJsApp);
        }
      })();

      return () => { disposed = true; };
    },
    [authorizationClient],
  );
  return itwinJsApp;
}

interface OpenIModelProps {
  iTwinJsApp: typeof ITwinJsApp | undefined;
}

function OpenIModel(props: OpenIModelProps): ReactElement | null {
  const { authorizationClient } = useAuthorization();
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string; }>();
  if (iTwinId === undefined || iModelId === undefined) {
    return null;
  }

  if (props.iTwinJsApp === undefined || authorizationClient === undefined) {
    return <LoadingScreen>Initializing...</LoadingScreen>;
  }

  return <props.iTwinJsApp iTwinId={iTwinId} iModelId={iModelId} authorizationClient={authorizationClient} />;
}

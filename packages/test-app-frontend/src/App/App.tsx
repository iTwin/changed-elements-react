/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgUser } from "@itwin/itwinui-icons-react";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Button, Surface } from "@itwin/itwinui-react";
import { PropsWithChildren, ReactElement, useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { applyUrlPrefix, clientId } from "../environment";
import "./App.css";
import { AppHeader } from "./AppHeader";
import {
  AuthorizationState, createAuthorizationProvider, SignInCallback, SignInSilent, SignInSilentCallback, useAuthorization
} from "./Authorization";
import { LoadingScreen } from "./common/LoadingScreen";
import { ErrorPage } from "./errors/ErrorPage";
import { IModelBrowser } from "./imodel-browser/IModelBrowser";
import { ITwinBrowser } from "./imodel-browser/ITwinBrowser";

import type { ITwinJsApp } from "./ITwinJsApp/ITwinJsApp";

export function App(): ReactElement {
  return (
    <AuthorizationProvider>
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
    </AuthorizationProvider>
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
      <Route index element={<Navigate replace to="/browse/iTwins" />} />
      <Route path="browse/iTwins">
        <Route index element={<ITwinBrowser />} />
        <Route path=":iTwinId" element={<IModelBrowser />} />
      </Route>
      <Route path="open-imodel/:iTwinId/:iModelId" element={<OpenIModel iTwinJsApp={iTwinJsApp} />} />
    </Routes>
  );
}

const AuthorizationProvider = clientId === "spa-xxxxxxxxxxxxxxxxxxxxxxxxx"
  // eslint-disable-next-line @typescript-eslint/ban-types
  ? (props: PropsWithChildren<{}>) => <>{props.children}</>
  : createAuthorizationProvider({
    authority: applyUrlPrefix("https://ims.bentley.com"),
    client_id: clientId,
    redirect_uri: "/auth/callback",
    silent_redirect_uri: "/auth/silent",
    post_logout_redirect_uri: "/",
    scope: "users:read imodels:read imodelaccess:read changedelements:read itwins:read",
  });

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
  const { userAuthorizationClient } = useAuthorization();
  useEffect(
    () => {
      if (!userAuthorizationClient) {
        return;
      }

      let disposed = false;
      void (async () => {
        const { ITwinJsApp, initializeITwinJsApp } = await import("./ITwinJsApp/ITwinJsApp.js");
        await initializeITwinJsApp(userAuthorizationClient);
        if (!disposed) {
          setITwinJsApp(() => ITwinJsApp);
        }
      })();

      return () => { disposed = true; };
    },
    [userAuthorizationClient],
  );
  return itwinJsApp;
}

interface OpenIModelProps {
  iTwinJsApp: typeof ITwinJsApp | undefined;
}

function OpenIModel(props: OpenIModelProps): ReactElement | null {
  const { userAuthorizationClient } = useAuthorization();
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string; }>();
  if (iTwinId === undefined || iModelId === undefined) {
    return null;
  }

  if (props.iTwinJsApp === undefined || userAuthorizationClient === undefined) {
    return <LoadingScreen>Initializing...</LoadingScreen>;
  }

  return <props.iTwinJsApp iTwinId={iTwinId} iModelId={iModelId} authorizationClient={userAuthorizationClient} />;
}

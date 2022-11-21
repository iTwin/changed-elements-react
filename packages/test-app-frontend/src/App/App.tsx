/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./App.css";
import { PropsWithChildren, ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SvgUser } from "@itwin/itwinui-icons-react";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Button, Surface } from "@itwin/itwinui-react";
import { applyUrlPrefix, clientId } from "../environment";
import { AppHeader } from "./AppHeader";
import {
  AuthorizationState, createAuthorizationProvider, SignInCallback, SignInSilent, useAuthorization,
} from "./Authorization";
import { LoadingScreen } from "./common/LoadingScreen";
import { ErrorPage } from "./errors/ErrorPage";
import { IModelBrowser } from "./imodel-browser/IModelBrowser";
import { ITwinBrowser } from "./imodel-browser/ITwinBrowser";

export function App(): ReactElement {
  return (
    <AuthorizationProvider>
      <PageLayout>
        <PageLayout.Header>
          <AppHeader />
        </PageLayout.Header>
        <Routes>
          <Route path="/auth/callback" element={<SignInCallback />} />
          <Route path="/auth/silent" element={<SignInSilent />} />
          <Route path="/*" element={<Main />} />
        </Routes>
      </PageLayout>
    </AuthorizationProvider>
  );
}

function Main(): ReactElement {
  const { state, signIn } = useAuthorization();
  if (state === AuthorizationState.Offline) {
    return <SetupEnvHint />;
  }

  if (state === AuthorizationState.Pending) {
    return <LoadingScreen>Checking signin status...</LoadingScreen>;
  }

  if (state === AuthorizationState.SignedOut) {
    return (
      <PageLayout.Content padded>
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
    </Routes>
  );
}

const AuthorizationProvider = clientId === "spa-xxxxxxxxxxxxxxxxxxxxxxxxx"
  ? (props: PropsWithChildren) => <>{props.children}</>
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

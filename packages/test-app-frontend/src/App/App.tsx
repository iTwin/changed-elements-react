/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { SvgImodelHollow, SvgPalette, SvgUser } from "@itwin/itwinui-icons-react";
import { PageLayout } from "@itwin/itwinui-layouts-react";
import { Button, SideNavigation, SidenavButton, Surface, ThemeProvider } from "@itwin/itwinui-react";
import { PropsWithChildren, ReactElement, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useMatch, useNavigate, useParams } from "react-router-dom";

import { applyUrlPrefix, clientId } from "../environment";
import { AppContext, appContext } from "./AppContext";
import { AppHeader } from "./AppHeader";
import {
  AuthorizationState, SignInCallback, SignInSilent, SignInSilentCallback, createAuthorizationProvider, useAuthorization
} from "./Authorization";
import { ComponentsCatalogRoutes } from "./ComponentsCatalog/ComponentsCatalog";
import type { ITwinJsApp } from "./ITwinJsApp/ITwinJsApp";
import { LoadingScreen } from "./common/LoadingScreen";
import { ErrorPage } from "./errors/ErrorPage";
import { IModelBrowser } from "./imodel-browser/IModelBrowser";
import { ITwinBrowser } from "./imodel-browser/ITwinBrowser";

import "./App.css";

export function App(): ReactElement {
  const [appContextValue, setAppContextValue] = useState<AppContext>({
    theme: "light",
    setTheme: (theme) => setAppContextValue((prev) => ({ ...prev, theme })),
  });

  return (
    <appContext.Provider value={appContextValue}>
      <AuthorizationProvider>
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

const AuthorizationProvider = clientId === "spa-xxxxxxxxxxxxxxxxxxxxxxxxx"
  ? (props: PropsWithChildren<unknown>) => <>{props.children}</>
  : createAuthorizationProvider({
    authority: "https://qa-ims.bentley.com",
    client_id: clientId,
    redirect_uri: "/auth/callback",
    silent_redirect_uri: "/auth/silent",
    post_logout_redirect_uri: "/",
    scope: "changedelements:modify imodelaccess:read changedelements:read imodels:read itwins:read users:read itwinjs",
  });

function Main(): ReactElement {
  const iTwinJsApp = useBackgroundITwinJsAppLoading();
  return (
    <>
      <AppSidebar />
      <Routes>
        <Route index element={<Navigate replace to="components" />} />
        <Route path="components/*" element={<ComponentsCatalogRoutes />}>
        </Route>
        <Route path="itwinjs" element={<ITwinJsAppTab />}>
          <Route index element={<Navigate replace to="browse/iTwins" />} />
          <Route path="browse/iTwins">
            <Route index element={<ITwinBrowser />} />
            <Route path=":iTwinId" element={<IModelBrowser />} />
          </Route>
          <Route path="open-imodel/:iTwinId/:iModelId" element={<OpenIModel iTwinJsApp={iTwinJsApp} />} />
        </Route>
      </Routes>
    </>
  );
}

function AppSidebar(): ReactElement {
  const match = useMatch(":tab/*");
  const navigate = useNavigate();
  return (
    <PageLayout.SideNavigation>
      <SideNavigation
        items={[
          <SidenavButton
            key="Components"
            startIcon={<SvgPalette />}
            title="Components catalog"
            isActive={match?.params.tab === "components"}
            onClick={() => navigate("components")}
          >
            Components
          </SidenavButton>,
          <SidenavButton
            key="iTwin.js App"
            startIcon={<SvgImodelHollow />}
            title="iTwin.js App"
            isActive={match?.params.tab === "itwinjs"}
            onClick={() => navigate("itwinjs")}
          >
            iTwin.js App
          </SidenavButton>,
        ]}
      />
    </PageLayout.SideNavigation>
  );
}

function ITwinJsAppTab(): ReactElement {
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

  return <Outlet />;
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

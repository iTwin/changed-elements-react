/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { AccessToken } from "@itwin/core-bentley";
import { AuthorizationClient } from "@itwin/core-common";
import { Code } from "@itwin/itwinui-react";
import { User, UserManager, WebStorageStateStore } from "oidc-client-ts";
import {
  ComponentType, createContext, Fragment, PropsWithChildren, ReactElement, ReactNode, useContext, useEffect, useRef,
  useState
} from "react";
import { useNavigate } from "react-router-dom";

import { applyUrlPrefix } from "../environment";
import { LoadingScreen } from "./common/LoadingScreen";
import { ErrorPage } from "./errors/ErrorPage";

export interface AuthorizationProviderConfig {
  authority: string;
  client_id: string;
  redirect_uri: string;
  silent_redirect_uri: string;
  post_logout_redirect_uri: string;
  scope: string;
}

/** Creates a context provider for authorization state. */
// eslint-disable-next-line @typescript-eslint/ban-types
export function createAuthorizationProvider(config: AuthorizationProviderConfig): ComponentType<PropsWithChildren<{}>> {
  const userManager = new UserManager({
    authority: config.authority,
    client_id: config.client_id,
    redirect_uri: `${window.location.origin}${config.redirect_uri}`,
    silent_redirect_uri: `${window.location.origin}${config.silent_redirect_uri}`,
    post_logout_redirect_uri: `${window.location.origin}${config.post_logout_redirect_uri}`,
    scope: config.scope,
    response_type: "code",
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 120,
    userStore: new WebStorageStateStore({ store: localStorage }),
  });
  userManager.events.addSilentRenewError((error) => {
    // eslint-disable-next-line no-console
    console.warn(error);
  });
  userManager.events.addAccessTokenExpiring(async () => {
    try {
      await userManager.signinSilent();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Silent sign in failed: ${error}`);
    }
  });

  const signIn = async () => {
    await userManager.signinRedirect({
      state: window.location.pathname + window.location.search + window.location.hash,
    });
  };
  const signOut = async () => userManager.signoutRedirect();

  // eslint-disable-next-line @typescript-eslint/ban-types
  return function AuthorizationProvider(props: PropsWithChildren<{}>): ReactElement {
    const [authorizationContextValue, setAuthorizationContextValue] = useState<AuthorizationContext>({
      userManager,
      state: AuthorizationState.Pending,
      user: undefined,
      userAuthorizationClient: undefined,
      signIn,
      signOut,
    });

    useEffect(
      () => {
        const handleUserLoaded = (user: User) => {
          setAuthorizationContextValue({
            userManager,
            state: AuthorizationState.SignedIn,
            user,
            userAuthorizationClient: new AuthClient(userManager),
            signIn,
            signOut,
          });
        };

        userManager.events.addUserLoaded(handleUserLoaded);

        return () => {
          userManager.events.removeUserLoaded(handleUserLoaded);
        };
      },
      [],
    );

    const firstRun = useRef(true);
    useEffect(
      () => {
        if (!firstRun || window.self !== window.top) {
          // It could be that parent document has already initiated silent sign-in in an invisible iframe, and now the
          // identity provider has redirected the iframe back to the app.
          return;
        }

        firstRun.current = false;
        let disposed = false;
        void (async () => {
          try {
            await userManager.signinSilent();
            await userManager.clearStaleState();
          } catch (error) {
            if (disposed) {
              return;
            }

            setAuthorizationContextValue({
              userManager,
              state: AuthorizationState.SignedOut,
              user: undefined,
              userAuthorizationClient: undefined,
              signIn,
              signOut,
            });
          }
        })();
        return () => { disposed = true; };
      },
      [],
    );

    return (
      <authorizationContext.Provider value={authorizationContextValue}>
        {props.children}
      </authorizationContext.Provider>
    );
  };
}

export type AuthorizationContext = {
  userManager: UserManager;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
} & (AuthorizationContextWithUser | AuthorizationContextWithoutUser);

interface AuthorizationContextWithUser {
  state: AuthorizationState.SignedIn;
  user: User;
  userAuthorizationClient: AuthorizationClient;
}

interface AuthorizationContextWithoutUser {
  state: Exclude<AuthorizationState, AuthorizationState.SignedIn>;
  user: undefined;
  userAuthorizationClient: undefined;
}

export enum AuthorizationState {
  Offline = "offline",
  Pending = "pending",
  SignedOut = "signedout",
  SignedIn = "signedin",
}

class AuthClient implements AuthorizationClient {
  constructor(private userManager: UserManager) { }

  public async getAccessToken(): Promise<AccessToken> {
    const user = await this.userManager.getUser();
    return user ? `${user.token_type} ${user.access_token}` : "";
  }
}

/** Returns current authorization state. */
export function useAuthorization(): AuthorizationContext {
  return useContext(authorizationContext);
}

const authorizationContext = createContext<AuthorizationContext>({
  userManager: new UserManager({ authority: "", client_id: "", redirect_uri: "" }),
  state: AuthorizationState.Offline,
  user: undefined,
  userAuthorizationClient: undefined,
  signIn: async () => { },
  signOut: async () => { },
});

/** Finalizes signin process when user is redirected back to the application. */
export function SignInCallback(): ReactElement {
  const { userManager } = useAuthorization();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState<OAuthError>();

  useEffect(
    () => {
      const params = new URLSearchParams(window.location.search);
      const errorCode = params.get("error");
      const errorDescription = params.get("error_description");
      if (isOAuthErrorCode(errorCode)) {
        // eslint-disable-next-line no-console
        console.error(`Authorization error (${errorCode}): ${errorDescription}`);
        setAuthError({ code: errorCode, description: errorDescription ?? undefined });
        return;
      }

      let disposed = false;
      void (async () => {
        try {
          const user = await userManager.signinRedirectCallback();
          if (disposed) {
            return;
          }

          navigate(user.state || "/", { replace: true });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error);

          if (!disposed) {
            setAuthError({ code: "unknown_error" });
          }
        }
      })();

      return () => { disposed = true; };
    },
    [userManager, navigate],
  );

  if (authError === undefined) {
    return <LoadingScreen>Signing in...</LoadingScreen>;
  }

  return <AuthenticationError error={authError} />;
}

const authErrors = new Set([
  "access_denied",
  "invalid_request",
  "unauthorized_client",
  "unsupported_response_type",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
] as const);

interface OAuthError {
  code: OAuthErrorCode | "unknown_error";
  description?: string;
}

type OAuthErrorCode = typeof authErrors extends Set<infer T> ? T : never;

function isOAuthErrorCode(code: unknown): code is OAuthErrorCode {
  type AuthError = typeof authErrors extends Set<infer T> ? T : never;
  return authErrors.has(code as AuthError);
}

interface AuthenticationErrorProps {
  error: OAuthError;
}

function AuthenticationError(props: AuthenticationErrorProps): ReactElement {
  const { userManager } = useAuthorization();

  if (props.error.code === "invalid_scope") {
    return (
      <ErrorPage title="Authorization Error" troubleshooting={getTroubleshootingText(userManager)}>
        The requested scope is unknown, malformed, or exceeds what application is permitted to request.
      </ErrorPage>
    );
  }

  return (
    <ErrorPage title="Authorization Error">
      {props.error.description ?? "Unknown error has occured"}
    </ErrorPage>
  );
}

function getTroubleshootingText(userManager: UserManager): ReactNode {
  const scopes = userManager.settings.scope?.split(" ");
  if (scopes === undefined || scopes.length === 0) {
    // oidc-client usually fails with an exception when no scopes are specified, so we should not reach this branch
    return null;
  }

  const scopeList: ReactElement[] = [];
  scopes.forEach((scope, index) => {
    scopeList.push(
      scopeList.length === 0
        ? <Code key={index}>{scope}</Code>
        : <Fragment key={index}>, <Code>{scope}</Code></Fragment>,
    );
  });

  return (
    <>
      Visit the application&apos;s registration page
      on <a title="iTwin Platform" href={applyUrlPrefix("https://developer.bentley.com/")}>iTwin Platform</a> to
      check if it has access to the following scopes: {scopeList}.
    </>
  );
}

/** Finalizes signin process for silent authorization when iframe is redirected back to the application. */
export function SignInSilent(): ReactElement {
  const { userManager } = useAuthorization();
  useEffect(
    () => {
      void (async () => {
        try {
          await userManager.signinSilentCallback();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(error);
        }
      })();
    },
    [userManager],
  );

  return <></>;
}

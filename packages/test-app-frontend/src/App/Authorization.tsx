/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { AuthorizationClient } from "@itwin/core-common";
import { Button, Code, useToaster } from "@itwin/itwinui-react";
import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import {
  Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement,
  type ReactNode
} from "react";
import { useNavigate } from "react-router-dom";

import { applyUrlPrefix } from "../environment.js";
import { LoadingScreen } from "./common/LoadingScreen.js";
import { ErrorPage } from "./errors/ErrorPage.js";

interface AuthorizationProviderProps {
  authority: string;
  clientId: string | undefined;
  redirectUri: string;
  silentRedirectUri: string;
  postLogoutRedirectUri: string;
  scope: string;
  children: ReactNode;
}


export type Toaster = ReturnType<typeof useToaster>;

export function AuthorizationProvider(props: AuthorizationProviderProps): ReactElement {
  const toaster = useToaster();
  const { clientId } = props;
  if (clientId === undefined) {
    return <>{props.children}</>;
  }

  return <InternalAuthorizationProvider {...props} clientId={clientId} toaster={toaster} />;
}

function InternalAuthorizationProvider(props: AuthorizationProviderProps & { clientId: string; } & { toaster: Toaster; }): ReactElement {
  const [userManager] = useState(() => new UserManager({
    authority: props.authority,
    client_id: props.clientId,
    redirect_uri: `${window.location.origin}${props.redirectUri}`,
    silent_redirect_uri: `${window.location.origin}${props.silentRedirectUri}`,
    post_logout_redirect_uri: `${window.location.origin}${props.postLogoutRedirectUri}`,
    scope: props.scope,
    response_type: "code",
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 120,
    userStore: new WebStorageStateStore({ store: localStorage }),
  }));

  useEffect(
    () => {
      return () => { userManager.events.unload(); };
    },
    [userManager],
  );

  const signIn = useCallback(
    async () => {
      await userManager.signinRedirect({
        state: window.location.pathname + window.location.search + window.location.hash,
      });
    },
    [userManager],
  );
  const signOut = useCallback(async () => userManager.signoutRedirect(), [userManager]);

  const authorizationClient = useMemo(
    () => new AuthClient(userManager, props.toaster, signIn),
    [userManager, props.toaster, signIn],
  );

  const [authorizationContextValue, setAuthorizationContextValue] = useState<AuthorizationContext>({
    state: AuthorizationState.Pending,
    user: undefined,
    authorizationClient,
    signIn,
    signOut,
  });

  const [internalAuthorizationContextValue] = useState<InternalAuthorizationContext>({
    userManager,
    loadUser: (user) => {
      setAuthorizationContextValue({
        state: AuthorizationState.SignedIn,
        user,
        authorizationClient,
        signIn,
        signOut,
      });
    },
  });

  useEffect(
    () => {
      const handleSilentRenewError = (error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(error);
      };

      const handleAccessTokenExpiring = async () => {
        try {
          await userManager.signinSilent();
        } catch (error) {
         props.toaster.informational(
            <SignInPopupPrompt text="Access token is expiring." onClick={signIn} />,
            { type: "persisting", hasCloseButton: true },
          );
        }
      };

      const handleUserUnloaded = () => {
        setAuthorizationContextValue({
          state: AuthorizationState.SignedOut,
          user: undefined,
          authorizationClient,
          signIn,
          signOut,
        });
      };

      userManager.events.addSilentRenewError(handleSilentRenewError);
      userManager.events.addAccessTokenExpiring(handleAccessTokenExpiring);
      userManager.events.addUserLoaded(internalAuthorizationContextValue.loadUser);
      userManager.events.addUserUnloaded(handleUserUnloaded);

      return () => {
        userManager.events.removeSilentRenewError(handleSilentRenewError);
        userManager.events.removeAccessTokenExpiring(handleAccessTokenExpiring);
        userManager.events.removeUserLoaded(internalAuthorizationContextValue.loadUser);
        userManager.events.removeUserUnloaded(handleUserUnloaded);
      };
    },
    [authorizationClient, internalAuthorizationContextValue, userManager, signIn, signOut],
  );

  return (
    <authorizationContext.Provider value={authorizationContextValue}>
      <internalAuthorizationContext.Provider value={internalAuthorizationContextValue}>
        {props.children}
      </internalAuthorizationContext.Provider>
    </authorizationContext.Provider>
  );
}

interface SignInPopupPromptProps {
  text: string;
  onClick: () => void;
}

function SignInPopupPrompt(props: SignInPopupPromptProps): ReactElement {
  return (
    <div style={{
      display: "grid",
      justifyContent: "space-between",
      grid: "1fr / 250px auto",
      alignItems: "center",
      gap: "var(--iui-size-s)",
    }}>
      {props.text}
      <Button styleType="high-visibility" onClick={props.onClick}>Sign in</Button>
    </div>
  );
}

export type AuthorizationContext = {
  authorizationClient: AuthorizationClient;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
} & (AuthorizationContextWithUser | AuthorizationContextWithoutUser);

interface InternalAuthorizationContext {
  userManager: UserManager;
  loadUser: (user: User) => void;
}

interface AuthorizationContextWithUser {
  state: AuthorizationState.SignedIn;
  user: User;
}

interface AuthorizationContextWithoutUser {
  state: Exclude<AuthorizationState, AuthorizationState.SignedIn>;
  user: undefined;
}

export enum AuthorizationState {
  Offline = "offline",
  Pending = "pending",
  SignedOut = "signedout",
  SignedIn = "signedin",
}

class AuthClient implements AuthorizationClient {
  #userManager: UserManager;
  #toaster: Toaster;
  #signIn: () => Promise<void>;
  #toastPromise: Promise<string> | undefined;

  constructor(
    userManager: UserManager,
    toaster: Toaster,
    signIn: () => Promise<void>,
  ) {
    this.#userManager = userManager;
    this.#toaster = toaster;
    this.#signIn = signIn;
  }

  public async getAccessToken(): Promise<string> {
    const user = await this.#userManager.getUser();
    if (user?.expired) {
      if (this.#toastPromise === undefined) {
        const { promise, resolve, reject } = Promise.withResolvers<string>();
        const { close } = this.#toaster.informational(
          <SignInPopupPrompt
            text="You are not signed in."
            onClick={() => this.#signIn().then(() => resolve(this.getAccessToken()))}
          />,
          { type: "persisting", hasCloseButton: true, onRemove: reject },
        );
        promise.finally(() => {
          this.#toastPromise = undefined;
          close();
        });
        this.#toastPromise = promise;
      }

      return this.#toastPromise;
    }

    return user ? `${user.token_type} ${user.access_token}` : "";
  }
}

/** Returns current authorization state. */
export function useAuthorization(): AuthorizationContext {
  return useContext(authorizationContext);
}

const authorizationContext = createContext<AuthorizationContext>({
  state: AuthorizationState.Offline,
  user: undefined,
  authorizationClient: { getAccessToken: async () => "" },
  signIn: async () => { },
  signOut: async () => { },
});

const internalAuthorizationContext = createContext<InternalAuthorizationContext>({
  userManager: new UserManager({ authority: "", client_id: "", redirect_uri: "" }),
  loadUser: () => { },
});

/** Finalizes signin process when user is redirected back to the application. */
export function SignInCallback(): ReactElement {
  const { userManager } = useContext(internalAuthorizationContext);
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
  const { userManager } = useContext(internalAuthorizationContext);

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
export function SignInSilentCallback(): ReactElement {
  const { userManager } = useContext(internalAuthorizationContext);
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

export function SignInSilent(): ReactElement {
  const { state } = useAuthorization();
  const { userManager, loadUser } = useContext(internalAuthorizationContext);
  const inProgress = useRef(false);

  useEffect(
    () => {
      if (inProgress.current || state !== AuthorizationState.Pending || window.self !== window.top) {
        // It could be that parent document has already initiated silent sign-in in an invisible iframe, and now the
        // identity provider has redirected the iframe back to the app.
        return;
      }

      inProgress.current = true;
      let disposed = false;
      void (async () => {
        try {
          const user = await userManager.getUser();
          if (user && !user.expired) {
            loadUser(user);
            return;
          }

          await userManager.signinSilent();
        } catch (error) {
          if (disposed) {
            return;
          }

          userManager.events.unload();
        } finally {
          inProgress.current = false;
        }

        await userManager.clearStaleState();
      })();
      return () => { disposed = true; };
    },
    [loadUser, state, userManager],
  );

  return <></>;
}

import React from "react";
import Auth from "@aws-amplify/auth";
import { getCognitoCookieInfo } from "./cognito";
import { IncomingMessage } from "http";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import base64 from "base-64";

export const AUTH_SYNC_KEY = "auth_sync_key";

export type IdTokenData = {
  sub: string;
  aud: string;
  email_verified: boolean;
  event_id: string;
  token_use: "id";
  auth_time: number;
  iss: string;
  "cognito:username": string;
  exp: number;
  iat: number;
  email: string;
};

export type AccessTokenData = {
  sub: string;
  event_id: string;
  token_use: string;
  scope: string;
  auth_time: number;
  iss: string;
  exp: number;
  iat: number;
  jti: string;
  client_id: string;
  username: string;
};

export type AuthTokens = {
  accessTokenData: AccessTokenData;
  idTokenData: IdTokenData;
  idToken: string;
  accessToken: string;
} | null;

type AWSCognitoPublicPem = {
  kid: string;
  pem: string;
};

function findMatchingPem(
  pems: AWSCognitoPublicPem[],
  token: string
): AWSCognitoPublicPem | undefined {
  if (!token) return undefined;
  const header = JSON.parse(base64.decode(token.split(".")[0]));
  return pems.find((pem) => pem.kid === header.kid);
}

function verifyToken<T extends { sub: string }>({
  pems,
  token,
  validate,
}: {
  pems: AWSCognitoPublicPem[];
  token: string | null;
  validate?: (data: T) => boolean;
}): null | T {
  if (!token) return null;
  try {
    const pemEntry = findMatchingPem(pems, token);
    if (!pemEntry) return null;
    const pem = pemEntry.pem;
    const data = jwt.verify(token, pem, { algorithms: ["RS256"] }) as T;
    if (!data) return null;
    if (validate ? !validate(data) : false) return null;
    return data;
  } catch (e) {
    if (!(e instanceof TokenExpiredError)) {
      console.log(e);
    }
    return null;
  }
}

function getAuthFromCookies(
  pems: AWSCognitoPublicPem[],
  cookie?: string
): AuthTokens {
  if (!cookie) return null;
  const userPoolWebClientId = Auth.configure(null).userPoolWebClientId;

  const { idToken, accessToken } = getCognitoCookieInfo(
    cookie,
    userPoolWebClientId
  );

  if (!idToken || !accessToken) return null;

  const idTokenData = verifyToken<IdTokenData>({
    pems,
    token: idToken,
    validate: (data) => data.aud === userPoolWebClientId,
  });
  const accessTokenData = verifyToken<AccessTokenData>({
    pems,
    token: accessToken,
    validate: (data) => data.client_id === userPoolWebClientId,
  });

  if (!idTokenData || !accessTokenData) return null;

  return { accessTokenData, idTokenData, idToken, accessToken };
}

export function createGetServerSideAuth({
  pems,
}: {
  pems: AWSCognitoPublicPem[];
}) {
  return function getServerSideAuth(req: IncomingMessage): AuthTokens {
    return getAuthFromCookies(pems, req.headers.cookie);
  };
}

// auto-login in case auth cookies have been added
function useAutoLogin(auth: AuthTokens, userPoolWebClientId?: string) {
  if (!userPoolWebClientId)
    // To fix this issue, call
    // Amplify.configure({ Auth: { userPoolWebClientId: <userPoolClientId> } })
    throw new Error(
      "Missing configuration value for userPoolWebClientId in Amplify's Auth"
    );

  // check on window activation
  React.useEffect(() => {
    // use localStorage to sync auth state across tabs
    const storageListener = (event: StorageEvent) => {
      // When event is unrelated, or when sync key was cleared
      if (event.key !== AUTH_SYNC_KEY || event.newValue === null) return;

      // clear localStorage item since we only needed it to sync across tabs
      localStorage.removeItem(AUTH_SYNC_KEY);

      const { idToken } = getCognitoCookieInfo(
        document.cookie,
        userPoolWebClientId
      );

      // login when user was not signed in before, or when the idToken changed
      if (idToken && (!auth || auth.idToken !== idToken)) {
        // do not log in on the token page since we could be loading
        // the cookies currently
        const pathname = window.location.pathname;
        if (pathname === "/token" || pathname.startsWith("/token/")) return;

        window.location.reload();
      }
    };

    // check on write to localStorage
    window.addEventListener("storage", storageListener);
    return () => {
      window.removeEventListener("storage", storageListener);
    };
  }, [auth]);
}

function useAutoLogout(auth: AuthTokens, userPoolWebClientId?: string) {
  if (!userPoolWebClientId)
    // To fix this issue, call
    // Amplify.configure({ Auth: { userPoolWebClientId: <userPoolClientId> } })
    throw new Error(
      "Missing configuration value for userPoolWebClientId in Amplify's Auth"
    );

  const isAuthenticated = Boolean(auth);

  // auto-logout in case loginsub cookie has been removed
  React.useEffect(() => {
    const listener = () => {
      const { idToken } = getCognitoCookieInfo(
        document.cookie,
        userPoolWebClientId
      );

      // User signed out locally, but server-side props still contain cookies.
      // This means the user signed out through a different tab.
      if (!idToken && isAuthenticated) {
        // do not log out on the token page since we could be loading
        // the cookies currently
        const pathname = window.location.pathname;
        if (pathname === "/token" || pathname.startsWith("/token/")) return;

        if (idToken) {
          // user signed out through another another application, so sign
          // user out completely to remove all auth cookies
          const redirectAfterSignOut = window.location.href;
          // Reconfigure oauth to add the uri of the page which should open
          // after the sign out
          //
          // Calling Auth.configure with null returns the current config
          const config = Auth.configure(null);
          Auth.configure({ oauth: { ...config.oauth, redirectAfterSignOut } });
          Auth.signOut();
        } else {
          // user signed out through another tab, so reload to
          // refresh server-side props
          window.location.reload();
        }
      }
    };

    window.addEventListener("focus", listener);
    // check on write to localStorage
    window.addEventListener("storage", listener);
    return () => {
      window.removeEventListener("focus", listener);
      window.removeEventListener("storage", listener);
    };
  }, [isAuthenticated]);
}

type LoginFunction = (redirectAfterSignIn?: string) => void;
type LogoutFunction = (redirectAfterSignOut?: string) => void;

// TODO sync this across multiple invocations?
// If you are using server-side rendering, pass "initialAuth" to this hook.
// If you are using static rendering, pass "null” to this hook.
//
// This hook is expected to be only called once per page at the moment.
// Pass the auth-state down to components using props if they need it.
export function createUseAuth({ pems }: { pems: AWSCognitoPublicPem[] }) {
  return function useAuth(initialAuth: AuthTokens): AuthTokens {
    const [auth, setAuth] = React.useState<AuthTokens>(initialAuth);

    const userPoolWebClientId = Auth.configure(null).userPoolWebClientId;
    useAutoLogin(auth, userPoolWebClientId);
    useAutoLogout(auth, userPoolWebClientId);

    React.useEffect(() => {
      // When there is a cookie, this takes ~100ms since it's verifying the cookie
      // When we decode only, it goes down to ~5ms.
      //
      // To speed up the client-side renders, we could decode only on the client.
      // But we'd probably need to verify the timestamp anyhow?
      //
      // Note that getAuthFromCookies also runs on the server, so improvements
      // can not have caching-problems.
      const cookieAuth = getAuthFromCookies(pems, document.cookie);
      setAuth(cookieAuth);
    }, []);

    return auth;
  };
}

export function useAuthFunctions() {
  const login: LoginFunction = React.useCallback((redirectAfterSignInUrl) => {
    const defaultRedirectUrl =
      window.location.pathname + window.location.search + window.location.hash;
    const redirectAfterSignIn = redirectAfterSignInUrl || defaultRedirectUrl;

    const config = Auth.configure(null);
    Auth.configure({ oauth: { ...config.oauth, redirectAfterSignIn } });
    Auth.federatedSignIn();
  }, []);

  const logout: LogoutFunction = React.useCallback(
    (redirectAfterSignOutUrl) => {
      const defaultRedirectUrl = window.location.href;
      const redirectAfterSignOut =
        redirectAfterSignOutUrl || defaultRedirectUrl;

      const config = Auth.configure(null);
      Auth.configure({ oauth: { ...config.oauth, redirectAfterSignOut } });
      Auth.signOut().then(() => {
        localStorage.setItem(AUTH_SYNC_KEY, "logout");
      });
    },
    []
  );

  return { login, logout };
}

// When a user comes back from authenticating, the url looks like this:
//   /token#id_token=....
// At this point, there will be no cookies yet. If we would render any page on
// the server now, it would seem as-if the user is not authenticated yet.
//
// We therefore wait until Amplify has set its cookies. It does this
// automatically because the id_token hash is present. Then we redirect the
// user back to the main page. That page can now use SSR as the user will have
// the necessary cookies ready.
export default function useAuthRedirect(
  onToken: (token: string | null) => void
) {
  const [triggeredReload, setTriggeredReload] = React.useState<boolean>(false);

  React.useEffect(() => {
    // only check when #id_token is in the hash, otherwise cookies can't appear
    // anyways
    if (triggeredReload) return;

    if (!window.location.hash.includes("id_token=")) {
      onToken(null);
      return;
    }

    function refreshOnAuthCookies() {
      if (triggeredReload) return;

      const userPoolWebClientId = Auth.configure(null).userPoolWebClientId;
      const cognitoCookieInfo = getCognitoCookieInfo(
        document.cookie,
        userPoolWebClientId
      );

      if (cognitoCookieInfo.idToken) {
        setTriggeredReload(true);
        localStorage.setItem(AUTH_SYNC_KEY, "login");
        onToken(cognitoCookieInfo.idToken);
      }
    }

    refreshOnAuthCookies();
    const interval = setInterval(refreshOnAuthCookies, 100);

    return () => {
      clearInterval(interval);
    };
  }, [triggeredReload, setTriggeredReload, onToken]);

  return null;
}

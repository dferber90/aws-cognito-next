import Cookies from "js-cookie";

const unauthenticatedCookies = {
  lastUser: null,
  idToken: null,
  accessToken: null,
};

// returns all auth cookies
export function getCognitoCookieInfo(
  cookieString: string | undefined,
  userPoolWebClientId?: string
): {
  lastUser: string | null;
  idToken: string | null;
  accessToken: string | null;
} {
  if (!userPoolWebClientId)
    // To fix this issue, call
    // Amplify.configure({ Auth: { userPoolWebClientId: <userPoolClientId> } })
    throw new Error(
      "Missing configuration value for userPoolWebClientId in Amplify's Auth"
    );

  if (!cookieString) return unauthenticatedCookies;

  const keyPrefix = `CognitoIdentityServiceProvider.${userPoolWebClientId}`;
  const lastUser = Cookies.get(`${keyPrefix}.LastAuthUser`) || null;

  const idTokenKey = lastUser ? `${keyPrefix}.${lastUser}.idToken` : null;
  const idToken = (idTokenKey && Cookies.get(idTokenKey)) || null;
  const accessTokenKey = lastUser
    ? `${keyPrefix}.${lastUser}.accessToken`
    : null;
  const accessToken = (accessTokenKey && Cookies.get(accessTokenKey)) || null;

  return { lastUser, idToken, accessToken };
}

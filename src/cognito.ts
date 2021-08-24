import cookie from "cookie";

const unauthenticatedCookies = {
  lastUser: null,
  idToken: null,
  accessToken: null,
};

// use same algorithm as js-cookie which is used in aws-amplify/auth@4.20
function userIdToTokenKey(key: string) {
  return encodeURIComponent(key)
    .replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent)
    .replace(/[()]/g, escape);
}

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

  const cookieData: { [key: string]: string } = cookie.parse(cookieString);
  const prefix = `CognitoIdentityServiceProvider.${userPoolWebClientId}`;
  const lastUserKey = `${prefix}.LastAuthUser`;
  const lastUser = cookieData[lastUserKey] ? cookieData[lastUserKey] : null;

  const idTokenKey = lastUser
    ? `${prefix}.${userIdToTokenKey(lastUser)}.idToken`
    : null;
  const idToken =
    idTokenKey && cookieData[idTokenKey] ? cookieData[idTokenKey] : null;
  const accessTokenKey = lastUser
    ? `${prefix}.${userIdToTokenKey(lastUser)}.accessToken`
    : null;
  const accessToken =
    accessTokenKey && cookieData[accessTokenKey]
      ? cookieData[accessTokenKey]
      : null;

  return { lastUser, idToken, accessToken };
}

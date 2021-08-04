import cookie from "cookie";

const unauthenticatedCookies = {
  lastUser: null,
  idToken: null,
  accessToken: null,
};

// if userId has a plus sign e.g. me+mine@gmail.com then the cookie key 
// preserves the plus sign
function userIdToTokenKey(userId){
  return encodeURIComponent(userId).replace(/%2B/g, '+');
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

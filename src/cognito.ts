import cookie from "cookie";

const unauthenticatedCookies = {
  lastUser: null,
  idToken: null,
  accessToken: null,
};

// returns all auth cookies
export function getCognitoCookieInfo(
  cookieString: string | undefined,
  userPoolClientId: string
): {
  lastUser: string | null;
  idToken: string | null;
  accessToken: string | null;
} {
  if (!cookieString) return unauthenticatedCookies;

  const cookieData: { [key: string]: string } = cookie.parse(cookieString);
  const prefix = `CognitoIdentityServiceProvider.${userPoolClientId}`;
  const lastUserKey = `${prefix}.LastAuthUser`;
  const lastUser = cookieData[lastUserKey] ? cookieData[lastUserKey] : null;

  const idTokenKey = lastUser
    ? `${prefix}.${encodeURIComponent(lastUser)}.idToken`
    : null;
  const idToken =
    idTokenKey && cookieData[idTokenKey] ? cookieData[idTokenKey] : null;
  const accessTokenKey = lastUser
    ? `${prefix}.${encodeURIComponent(lastUser)}.accessToken`
    : null;
  const accessToken =
    accessTokenKey && cookieData[accessTokenKey]
      ? cookieData[accessTokenKey]
      : null;

  return { lastUser, idToken, accessToken };
}

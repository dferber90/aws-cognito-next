import React, { ReactNode } from "react";
import { useRouter } from "next/router";
import { getCognitoCookieInfo } from "./cognito";
import queryString from "query-string";
import { AUTH_SYNC_KEY } from "./auth";

const extractFirst = (value: string | string[]) => {
  return Array.isArray(value) ? value[0] : value;
};

// When a user comes back from authenticating, the url looks like this:
//   /autosignin#id_token=....
// At this point, there will be no cookies yet. If we would render any page on
// the server now, it would seem as-if the user is not authenticated yet.
//
// We therefore wait until Amplify has set its cookies. It does this
// automatically because the id_token hash is present. Then we redirect the
// user back to the main page. That page can now use SSR as the user will have
// the necessary cookies ready.
export default function Token(props: { children: ReactNode }) {
  const router = useRouter();
  const [triggeredReload, setTriggeredReload] = React.useState<boolean>(false);

  React.useEffect(() => {
    // only check when #id_token is in the hash, otherwise cookies can't appear
    // anyways
    if (triggeredReload) return;

    // We are not using the router here, since the query object will be empty
    // during prerendering if the page is statically optimized.
    // So the router's location would return no search the first time this
    // page renders.
    const redirectUriAfterSignIn =
      extractFirst(queryString.parse(window.location.search).to || "") || "/";

    if (!window.location.hash.includes("id_token=")) {
      router.replace(redirectUriAfterSignIn);
      return;
    }

    function refreshOnAuthCookies() {
      if (triggeredReload) return;

      const cognitoCookieInfo = getCognitoCookieInfo(
        document.cookie,
        process.env.USER_POOL_CLIENT_ID!
      );

      console.log(cognitoCookieInfo);

      if (cognitoCookieInfo.idToken) {
        console.log("decided to reload");
        setTriggeredReload(true);
        router.replace(redirectUriAfterSignIn);
        localStorage.setItem(AUTH_SYNC_KEY, "login");
      }
    }

    refreshOnAuthCookies();
    const interval = setInterval(refreshOnAuthCookies, 100);

    return () => {
      clearInterval(interval);
    };
  }, [triggeredReload, setTriggeredReload, router]);

  return <React.Fragment>{props.children}</React.Fragment>;
}

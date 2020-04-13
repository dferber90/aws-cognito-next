import React, { ReactNode } from "react";
import { getCognitoCookieInfo } from "./cognito";
import { AUTH_SYNC_KEY } from "./auth";
import PropTypes from "prop-types";

// When a user comes back from authenticating, the url looks like this:
//   /autosignin#id_token=....
// At this point, there will be no cookies yet. If we would render any page on
// the server now, it would seem as-if the user is not authenticated yet.
//
// We therefore wait until Amplify has set its cookies. It does this
// automatically because the id_token hash is present. Then we redirect the
// user back to the main page. That page can now use SSR as the user will have
// the necessary cookies ready.
export default function Token(props: {
  children: ReactNode;
  userPoolClientId: string;
  onToken: (token: string | null) => void;
}) {
  const [triggeredReload, setTriggeredReload] = React.useState<boolean>(false);
  const { onToken } = props;

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

      const cognitoCookieInfo = getCognitoCookieInfo(
        document.cookie,
        props.userPoolClientId
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

  return <React.Fragment>{props.children}</React.Fragment>;
}

Token.propTypes = {
  userPoolClientId: PropTypes.string.isRequired,
  onToken: PropTypes.func.isRequired,
  children: PropTypes.node,
};

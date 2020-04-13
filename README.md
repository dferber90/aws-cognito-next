# aws-cognito-next

## Setup

### Installation

```
yarn add aws-cognito-auth
```

You also need to install the modular AWS packages:

```
yarn add @aws-amplify/auth @aws-amplify/core
```

### Integration

#### Add `pems:prepare` script

```json
{
  "scripts": {
    "pems:prepare": "prepare-pems --region $USER_POOL_REGION --userPoolId $USER_POOL_ID"
  }
}
```

This will create a `pems.json` file. Commit that file to your project.
You can rerun `yarn pems:prepare` whenever you need to refresh the keys.

#### Setup env vars

This depends on how your deployment is set up. You need different settings for local development and for production.

You need to provide the following environment variables:

```env
IDP_DOMAIN=<doamin>.auth.<region>.amazoncognito.com
USER_POOL_REGION=eu-central-1
USER_POOL_ID=eu-central-1_xxxxxx
USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
REDIRECT_SIGN_IN=http://localhost:3000/token
REDIRECT_SIGN_OUT=http://localhost:3000/
AUTH_COOKIE_DOMAIN=localhost
```

#### App

Create a file called `_app.js` (or `_app.tsx` if you're using TypeScript). This custom app will configure Amplify and Auth for all pages of your application.

We need to configure `Amplify` to use `cookieStorage`. That way the auth tokens get sent to the server, which allows us to use server-side rendering. This can be done by configuring `cookieStorage` as shown below.

```tsx
import React from "react";
import { AppProps } from "next/app";
import Amplify from "@aws-amplify/core";
import Auth from "@aws-amplify/auth";

Amplify.configure({
  Auth: {
    region: process.env.USER_POOL_REGION,
    userPoolId: process.env.USER_POOL_ID,
    userPoolWebClientId: process.env.USER_POOL_CLIENT_ID,

    // Configuration for cookie storage
    // see https://aws-amplify.github.io/docs/js/authentication
    cookieStorage: {
      // REQUIRED - Cookie domain
      // This should be the subdomain in production as
      // the cookie should only be present for the current site
      domain: process.env.AUTH_COOKIE_DOMAIN,
      // OPTIONAL - Cookie path
      path: "/",
      // OPTIONAL - Cookie expiration in days
      expires: 7,
      // OPTIONAL - Cookie secure flag
      // Either true or false, indicating whether the cookie
      // transmission requires a secure protocol (https).
      // The cookie should be set to secure in production.
      secure: false,
    },
  },
});

Auth.configure({
  oauth: {
    domain: process.env.IDP_DOMAIN,
    scope: ["email", "openid"],
    // Where users get sent after logging in.
    // This has to be set to be the full URL of the /token page.
    redirectSignIn: process.env.REDIRECT_SIGN_IN,
    // Where users are sent after they sign out.
    redirectSignOut: process.env.REDIRECT_SIGN_OUT,
    responseType: "token",
  },
});

function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

export default App;
```

#### `_auth.ts`

The application needs to know about your public pems. It would be inconvenient to pass the pem files in over and over again. Instead you'll use factory functions to create your auth functions.

Create a file called `_auth.tsx` inside your `pages` folder, and fill it with the following content:

```tsx
import { createGetServerSideAuth, createUseAuth } from "aws-cognito-next";
import pems from "../pems.json";

// create functions by passing pems
export const getServerSideAuth = createGetServerSideAuth({ pems });
export const useAuth = createUseAuth({ pems });

// reexport functions from aws-cognito-next
export * from "aws-cognito-next";
```

In your application, you can now import everything related to auth from `_auth.tsx`.

> It's recommended to not import from `aws-cognito-next`. `_auth.tsx` will be a superset of `aws-cognito-auth`. This means `useAuth` and `getServerSideAuth` is only exported from `_auth.tsx`, but not from `aws-cognito-next`. Since you don't want to end up with different imports for the same things, it's better to stick to `_auth.tsx`.

#### `pages/token.tsx`

```tsx
import React from "react";
import { useRouter } from "next/router";
import { useAuthRedirect } from "aws-cognito-next";
import queryString from "query-string";

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
export default function TokenSetter() {
  const router = useRouter();

  useAuthRedirect(() => {
    // We are not using the router here, since the query object will be empty
    // during prerendering if the page is statically optimized.
    // So the router's location would return no search the first time.
    const redirectUriAfterSignIn =
      extractFirst(queryString.parse(window.location.search).to || "") || "/";

    router.replace(redirectUriAfterSignIn);
  });

  return <p>loading..</p>;
}
```

## Usage

### `useAuth`

The auth can be used in two different ways. Either you want to prepare the user information on the server and leverage server-side rendering, or you want your server to render a pre-authentication-state (like a page with placeholders), and then have the client deal with authentication.

#### For server-side rendering

For a server-rendered page, you first need to fetch the user information.

```tsx
import { GetServerSideProps } from "next";
import { useAuth, AuthTokens, getServerSideAuth } from "../_auth";

export const getServerSideProps: GetServerSideProps<{
  initialAuth: AuthTokens;
}> = async (context) => {
  // getServerSideAuth will parse the cookie
  const initialAuth = getServerSideAuth(context.req);
  return { props: { initialAuth } };
};
```

We can then reuse the server-side authentication to render the initial page, by passing `props.initialAuth` to `useAuth`. That way the server and the client's initial render will always match.

```tsx
export default function Home(props: { initialAuth: AuthTokens }) {
  const auth = useAuth(props.initialAuth);

  return (
    <React.Fragment>
      {auth ? (
        <p>Welcome {auth.idTokenData["cognito:username"]}</p>
      ) : (
        <p>Welcome anonymous</p>
      )}
    </React.Fragment>
  );
}
```

#### For client-side rendering only

When you want to skip the auth check on the server, you can use client-side rendering.
By calling `useAuth(null)` the page will render as-if no user is authenticated for the first render.

```tsx
export default function Home(props: { initialAuth: AuthTokens }) {
  const auth = useAuth(props.initialAuth);

  return (
    <React.Fragment>
      {auth ? (
        <p>Welcome {auth.idTokenData["cognito:username"]}</p>
      ) : (
        <p>Welcome anonymous</p>
      )}
    </React.Fragment>
  );
}
```

After the first render, `useAuth` will check whether a user is authenticated on the client and rerender the page if so.

### `useAuthFunctions`

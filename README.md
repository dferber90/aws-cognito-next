# aws-cognito-next

Authentication helpers to enable usage of [AWS Cognito](https://aws.amazon.com/en/cognito/) in [next.js](https://nextjs.org/) applications.

### Pros

Supports server-side rendering of pages depending on the authenticated user. It's also flexible enough to support statically rendered pages, where the client then adds authentication information once the app is hydrated. It syncs auth state across multiple tabs. Auth information is sent to the server using Cognito's cookies, so the authenticated user is available in your API functions.

### Cons

While the auth cookies are sent with the `secure` flag enabled (only over HTTPS), the cookies can not be set to `httpOnly`. So it will be possible to access them from JavaScript. This is a limitation of using AWS Amplify. The default Amplify configuration has the same problem, except that the tokens are stored in `localStorage` then.

See [MDN](https://developer.mozilla.org/de/docs/Web/HTTP/Cookies) for more information about `secure` and `httpOnly` cookies.

## Table of contents

- [Setup](#setup)
  - [Installation](#installation)
  - [Integration](#integration)
    - [Add `pems:prepare` script](#add-pemsprepare-script)
    - [Setup env vars](#setup-env-vars)
    - [\_app.tsx](#_app.tsx)
    - [\_auth.ts](#_authts)
    - [pages/token.tsx](#pagestokentsx)
- [Usage](#usage)
  - [useAuth](#useauth)
    - [For server-side rendering](#for-server-side-rendering)
    - [For client-side rendering only](#for-client-side-rendering-only)
  - [useAuthFunctions](#useauthfunctions)
  - [useAuthRedirect](#useauthredirect)

## Setup

### Installation

```
yarn add aws-cognito-next
```

You also need to install the modular AWS Amplify packages:

```
yarn add @aws-amplify/auth @aws-amplify/core
```

### Integration

This library integrates with your application in a few different places. Follow these steps to set it up properly.

#### Add `pems:prepare` script

Add the `pems:prepare` to the `scripts` section in your `package.json`.

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",

    // add this
    "pems:prepare": "prepare-pems --region $USER_POOL_REGION --userPoolId $USER_POOL_ID"
  }
}
```

When you execute `pems:prepare`, the script will create a `pems.json` file containing the public keys of your AWS Cognito User Pool as pems. Commit that file to your project.

Run it once to create the initial `pems.json` file. You can run it like this:

```bash
USER_POOL_REGION=<userPoolRegion> USER_POOL_ID=<userPoolId> yarn pems:prepare
```

You can rerun `yarn pems:prepare` whenever you need to refresh the keys. In case a `pems.json` file exists already, the new pems will be added to the file. You can have the pems for multiple user pools in the same file. It's okay to add the pems for the user pools of development, staging and production to the same `pems.json` file. The appropriate pems will be loaded automatically.

#### Setup env vars

How you set up your environment variables depends on your deployment setup.

You will need different environment variable values for local development and for production.

You need to provide the following environment variables:

```bash
IDP_DOMAIN=<doamin>.auth.<region>.amazoncognito.com
USER_POOL_REGION=eu-central-1
USER_POOL_ID=eu-central-1_xxxxxx
USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
REDIRECT_SIGN_IN=http://localhost:3000/token
REDIRECT_SIGN_OUT=http://localhost:3000/
AUTH_COOKIE_DOMAIN=localhost
```

#### `_app.tsx`

Create a file called `_app.tsx` (or `_app.js` if you're not using TypeScript). This custom app will configure Amplify and Auth for all pages of your application.

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

The application needs to know about your AWS Cognito User Pool's public pems, which you created earlier by executing `yarn pems:perpare` in the first step of the setup.

It would be inconvenient to pass the pem files to `aws-cognito-next`'s functions over and over again. Instead you'll use factory functions to create your auth functions.

Create a file called `pages/_auth.tsx` and fill it with the following content:

```tsx
import { createGetServerSideAuth, createUseAuth } from "aws-cognito-next";
import pems from "../pems.json";

// create functions by passing pems
export const getServerSideAuth = createGetServerSideAuth({ pems });
export const useAuth = createUseAuth({ pems });

// reexport functions from aws-cognito-next
export * from "aws-cognito-next";
```

In your application, you can now import everything related to auth from `_auth.tsx`, as you'll see in the next step.

> It's recommended to not import from `aws-cognito-next`. `_auth.tsx` will be a superset of `aws-cognito-auth`. This means `useAuth` and `getServerSideAuth` is only exported from `_auth.tsx`, but not from `aws-cognito-next`. Since you don't want to end up with different imports for the same things, it's better to stick to `_auth.tsx`.

#### `pages/token.tsx`

```tsx
import React from "react";
import { useRouter } from "next/router";

// Here we import useAuthRedirect from _auth.tsx, instead
// of from aws-cognito-next.
// We created that file in the previous step.
import { useAuthRedirect } from "./_auth.tsx";

// When a user comes back from authenticating, the url looks
// like this: /token#id_token=....
// At this point, there will be no cookies yet.
// If we would render any page on the server now,
// it would seem as-if the user is not authenticated yet.
//
// We therefore wait until Amplify has set its cookies.
// It does this automatically because the id_token hash
// is present. Then we redirect the user back to the main page.
// That page can now use SSR as the user will have
// the necessary cookies ready.
export default function Token() {
  const router = useRouter();

  useAuthRedirect(() => {
    router.replace("/");
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

```tsx
import { useAuth, useAuthFunctions } from "./_auth";

export default function SomePage() {
  const auth = useAuth(null);
  const { login, logout } = useAuthFunctions();

  return auth ? (
    <button
      type="button"
      onClick={() => {
        logout();
      }}
    >
      Sign out
    </button>
  ) : (
    <button
      type="button"
      onClick={() => {
        login();
      }}
    >
      sign in
    </button>
  );
}
```

### `useAuthRedirect`

When Coginto authenticated the user, the user will be redirected to `/token#<hash>`. The hash of the URL will contain the user's access and id tokens. Amplify will read the hash and set the cookies accordingly. Once the cookies are set, even pages depending on the authenticated user can be rendered on the server.

Call the `useAuthRedirect` hook and pass a function as a callback. That function will be called with an `idToken` as soon as the cookies are ready, or with `null` when no `id_token` was contained in the hash.

```tsx
import React from "react";
import { useRouter } from "next/router";
import { useAuthRedirect } from "./_auth";

// When a user comes back from authenticating, the url looks like this:
//   /autosignin#id_token=....
// At this point, there will be no cookies yet. If we would render any page on
// the server now, it would seem as-if the user is not authenticated yet.
//
// We therefore wait until Amplify has set its cookies. It does this
// automatically because the id_token hash is present. Then we redirect the
// user back to the main page. That page can now use SSR as the user will have
// the necessary cookies ready.
export default function Token() {
  const router = useRouter();

  useAuthRedirect(() => {
    router.replace("/");
  });

  // You can render your own loading spinner here
  return <p>loading..</p>;
}
```

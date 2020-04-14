#!/usr/bin/env node

const argv = require("yargs")
  .usage("Fetches Cognito User Pool's public keys and converts them to pems.")
  .usage("Usage: $0 --region [region] -userPoolId [userPoolId]")
  .option("region", {
    type: "string",
    description: "AWS Region of Cognito User Pool",
    require: true,
  })
  .option("userPoolId", {
    type: "string",
    description: "User Pool Id of Cognito User Pool",
    require: true,
  })
  .option("out", {
    type: "string",
    description: "File to write pems to",
    default: "pems.json",
  }).argv;

const region = argv.region;
const userPoolId = argv.userPoolId;
const out = argv.out;

// A script which creates pems.json depending on the env-vars by fetching them
// from the URL shown in the docs below and writing the result to pems.json.
//  https://aws.amazon.com/de/premiumsupport/knowledge-center/decode-verify-cognito-json-token/
//  https://github.com/awslabs/aws-support-tools/tree/master/Cognito/decode-verify-jwt
// Different types of tokens
//  https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const jwkToPem = require("jwk-to-pem");

const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

fetch(url)
  .then((res) => res.json())
  .then(
    (res) => {
      if (res.message) {
        console.error(res.message);
        return process.exit(1);
      }

      if (!Array.isArray(res.keys) || res.keys.length === 0) {
        console.error("No keys present in response");
        console.log(res);
        return process.exit(1);
      }

      const outputFile = path.join(process.cwd(), out);

      let existingPems;
      try {
        existingPems = require(outputFile);
      } catch (e) {
        existingPems = {};
      }

      // map public-keys to pems, so the client/server don't need to do it
      // on every request
      const pems = res.keys.reduce((acc, key) => {
        if (!acc[region]) acc[region] = { [userPoolId]: {} };
        acc[region][userPoolId][key.kid] = jwkToPem(key);
        return acc;
      }, existingPems);

      fs.writeFileSync(outputFile, JSON.stringify(pems, null, 2));
    },
    () => {
      const red = (str) => `\x1b[31m${str}\x1b[0m`;
      console.error(red("Error"), `Could not fetch jwks.json from Cognito`);
      console.error(`Tried "${url}", but it does not exist.`);
      console.error(``);
      console.error(
        `Maybe the provided region (${region}) or userPoolId (${userPoolId}) are incorrect?`
      );
      return process.exit(1);
    }
  );

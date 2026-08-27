// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import url from "url"
import urljoin from "url-join"
import csrf from "csurf"

import { hydraAdmin } from "../config"
import { oidcConformityMaybeFakeAcr } from "./stub/oidc-cert"

// Sets up csrf protection
const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

/**
 * Appelle l'API interne Go pour vérifier la preuve SRP (Étape 2)
 */
async function verifySrpWithCoreApi(sessionId: string, a: string, m1: string): Promise<boolean> {
  const apiUrl = `${process.env.CORE_API_URL}/api/internal/auth/srp/verify`

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CORE_API_INTERNAL_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: sessionId,
        a: a,
        m1: m1,
      }),
    })

    if (!response.ok) {
      console.error(`SRP Verification failed on Core API: ${response.status} ${response.statusText}`)
      return false
    }

    // response.json() with { token, m2 } returned by  Core API
    return true
  } catch (error) {
    console.error("Erreur de communication avec l'API Core lors du SRP verify:", error)
    return false
  }
}

router.get("/", csrfProtection, (req, res, next) => {
  // Parses the URL query
  const query = url.parse(req.url, true).query

  // The challenge is used to fetch information about the login request from ORY Hydra.
  const challenge = String(query.login_challenge)
  if (!challenge) {
    next(new Error("Expected a login challenge to be set but received none."))
    return
  }

  hydraAdmin
    .getOAuth2LoginRequest({
      loginChallenge: challenge,
    })
    .then((loginRequest) => {
      // If hydra was already able to authenticate the user, skip will be true and we do not need to re-authenticate the user.
      if (loginRequest.skip) {
        return hydraAdmin
          .acceptOAuth2LoginRequest({
            loginChallenge: challenge,
            acceptOAuth2LoginRequest: {
              subject: String(loginRequest.subject),
            },
          })
          .then(({ redirect_to }) => {
            res.redirect(String(redirect_to))
          })
      }

      // If authentication can't be skipped we MUST show the login UI.
      res.render("login", {
        csrfToken: req.csrfToken(),
        challenge: challenge,
        action: urljoin(process.env.BASE_URL || "", "/login"),
        hint: loginRequest.oidc_context?.login_hint || "",
        webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
        coreApiDomain: process.env.CORE_API_URL,
      })
    })
    .catch(next)
})

// Route POST : Traite la soumission du formulaire et effectue le SRP Step 2
router.post("/", csrfProtection, async (req, res, next) => {
  const challenge = req.body.challenge

    // Looks like the consent request was denied by the user
  if (req.body.submit === "Deny access" || req.body.btn_submit === "Deny access") {
    return hydraAdmin
      .rejectOAuth2LoginRequest({
        loginChallenge: challenge,
        rejectOAuth2Request: {
          error: "access_denied",
          error_description: "The resource owner denied the request",
        },
      })
      .then(({ redirect_to }) => {
        res.redirect(String(redirect_to))
      })
      .catch(next)
  }

  const username = String(req.body.username || "").trim()
  const srpSessionId = String(req.body.srpSessionId || "")
  const srpA = String(req.body.srpA || "")
  const srpM1 = String(req.body.srpM1 || "")

  if (!srpSessionId || !srpA || !srpM1) {
    return res.render("login", {
      csrfToken: req.csrfToken(),
      challenge: challenge,
      action: urljoin(process.env.BASE_URL || "", "/login"),
      hint: username,
      error: "Invalid authentication payload.",
      webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
      coreApiDomain: process.env.CORE_API_URL,
    })
  }
  const isAuthenticated = await verifySrpWithCoreApi(srpSessionId, srpA, srpM1)

  if (!isAuthenticated) {
    return res.render("login", {
      csrfToken: req.csrfToken(),
      challenge: challenge,
      action: urljoin(process.env.BASE_URL || "", "/login"),
      hint: username,
      error: "Incorrect username or password.",
      webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
      coreApiDomain: process.env.CORE_API_URL,
    })
  }
  // Seems like the user authenticated! Let's tell hydra...
  try {
    const loginRequest = await hydraAdmin.getOAuth2LoginRequest({ loginChallenge: challenge })


    const secret = req.body.secret;
    const secretId = req.body.secretId;

    if (secret && secretId) {
    const apiUrl = `${process.env.CORE_API_URL}/api/internal/bridge/secret`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.CORE_API_INTERNAL_SECRET}`,
        },
        body: JSON.stringify({
          encryptedData: secret,
          ttlSeconds: 300,
          id: secretId,
        }),
      })

      if (!response.ok) {
        throw new Error(`Erreur API Bridge: ${response.status} ${response.statusText}`)
      }
    }
    const { redirect_to } = await hydraAdmin.acceptOAuth2LoginRequest({
      loginChallenge: challenge,
      acceptOAuth2LoginRequest: {
        subject: username,

        remember: Boolean(req.body.remember),
        remember_for: 28800, // 8 hours

        acr: oidcConformityMaybeFakeAcr(loginRequest, "0"),
      },
    })

    res.redirect(String(redirect_to))
  } catch (error) {
    next(error)
  }
})

export default router

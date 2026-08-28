// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import url from "url"
import urljoin from "url-join"
import csrf from "csurf"
import * as opaque from "@serenity-kit/opaque"

import { hydraAdmin } from "../config"
import { oidcConformityMaybeFakeAcr } from "./stub/oidc-cert"
import { getOpaque, initServerSetup } from "../opaque"

const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

let serverSetup: any = null
opaque.ready
  .then(() => {
    serverSetup = initServerSetup();
      })
  .catch((err) => {
    console.error("can't init in login.ts OPAQUE WASM:", err)
  })

interface OpaqueSession {
  serverLoginState: string
  username: string
  expiresAt: number
}
const opaqueSessions = new Map<string, OpaqueSession>()

setInterval(() => {
  const now = Date.now()
  for (const [id, session] of opaqueSessions.entries()) {
    if (now > session.expiresAt) opaqueSessions.delete(id)
  }
}, 60000)


/**
 * Route 1 : Init OPAQUE (Challenge KE1 -> KE2)
 */
router.post("/opaque/init", async (req, res) => {
  try {
    if (!serverSetup) {
      await opaque.ready
      if (!serverSetup) {
        initServerSetup()
      }
    }

    const { username, startLoginRequest } = req.body

    if (!username || !startLoginRequest) {
      return res.status(400).json({ error: "username et credentialRequest requis" })
    }

    const registrationRecord = await getOpaque(username)
    if (!registrationRecord) {
      return res.status(401).json({ error: "Identifiants invalides" })
    }

    const { serverLoginState, loginResponse } = opaque.server.startLogin({
      serverSetup,
      userIdentifier: username,
      registrationRecord,
      startLoginRequest,
    })

    const sessionId = crypto.randomUUID()
    opaqueSessions.set(sessionId, {
      serverLoginState,
      username,
      expiresAt: Date.now() + 2 * 60 * 1000, //2min
    })

    return res.json({
      sessionId,
      loginResponse,
    })
  } catch (err) {
    console.error("Erreur when OPAQUE login-init:", err)
    return res.status(400).json({ error: "Échec de l'initialisation du challenge" })
  }
})

router.get("/", csrfProtection, (req, res, next) => {
  const query = url.parse(req.url, true).query
  const challenge = String(query.login_challenge)

  if (!challenge) {
    next(new Error("Expected a login challenge to be set but received none."))
    return
  }

  hydraAdmin
    .getOAuth2LoginRequest({ loginChallenge: challenge })
    .then((loginRequest) => {
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

      res.render("login", {
        csrfToken: req.csrfToken(),
        challenge: challenge,
        action: urljoin(process.env.BASE_URL || "", "/login"),
        hint: loginRequest.oidc_context?.login_hint || "",
        webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
        ssoDomain: process.env.BASE_URL || "",
      })
    })
    .catch(next)
})

/**
 * Route 2 : (Check KE3)
 */
router.post("/", csrfProtection, async (req, res, next) => {
   if (!serverSetup) {
      await opaque.ready
      if (!serverSetup) {
        serverSetup = initServerSetup();
      }
    }
  const challenge = req.body.challenge

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
  const opaqueSessionId = String(req.body.opaqueSessionId || "")
  const opaqueKe3 = String(req.body.opaqueKe3 || "")

  const session = opaqueSessions.get(opaqueSessionId)
  opaqueSessions.delete(opaqueSessionId) // Consommation à usage unique (burn after reading)

  if (!session || Date.now() > session.expiresAt || session.username !== username) {
    return res.render("login", {
      csrfToken: req.csrfToken(),
      challenge: challenge,
      action: urljoin(process.env.BASE_URL || "", "/login"),
      hint: username,
      error: "Invalid authentication payload.",
      webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
      ssoDomain: process.env.BASE_URL || "",
    })
  }

  let isAuthenticated = false
  try {
    const { sessionKey } = opaque.server.finishLogin({
      finishLoginRequest: opaqueKe3,
      serverLoginState: session.serverLoginState,
    })
    if(sessionKey) isAuthenticated = true;
  } catch (err) {
    console.error("Échec de la validation KE3 OPAQUE:", err)
    isAuthenticated = false
  }

  if (!isAuthenticated) {
    return res.render("login", {
      csrfToken: req.csrfToken(),
      challenge: challenge,
      action: urljoin(process.env.BASE_URL || "", "/login"),
      hint: username,
      error: "Incorrect username or password.",
      webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
      ssoDomain: process.env.BASE_URL || "",
    })
  }

  try {
    const loginRequest = await hydraAdmin.getOAuth2LoginRequest({ loginChallenge: challenge })

    const secret = req.body.secret
    const secretId = req.body.secretId

    if (secret && secretId) {
      const apiUrl = `${process.env.CORE_API_URL}/api/internal/bridge/secret`

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
          loginToken: req.body.loginToken,
          username: username,
        }),
      })

      if (!response.ok) {
        throw new Error(`Error API Bridge: ${response.status} ${response.statusText}`)
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
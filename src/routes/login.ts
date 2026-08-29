// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import url from "url"
import csrf from "csurf"
import * as opaque from "@serenity-kit/opaque"

import { hydraAdmin } from "../config.js"
import { getOpaque, initServerSetup } from "../opaque.js"

const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

let serverSetup: any = null
opaque.ready
  .then(() => {
    serverSetup = initServerSetup()
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
 * 1 : Init OPAQUE (KE1 -> KE2)
 */
router.post("/opaque/init", async (req, res) => {
  try {
    if (!serverSetup) {
      await opaque.ready
      if (!serverSetup) {
        serverSetup = initServerSetup()
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
      expiresAt: Date.now() + 2 * 60 * 1000,
    })

    return res.json({
      sessionId,
      loginResponse,
    })
  } catch (err) {
    console.error("Error when OPAQUE login-init:", err)
    return res.status(400).json({ error: "Can't init challenge" })
  }
})

router.get("/", csrfProtection, async (req, res, next) => {
  try {
    const query = url.parse(req.url, true).query
    const challenge = String(query.login_challenge || "")

    if (!challenge) {
      next(new Error("Expected a login challenge to be set but received none."))
      return
    }

    const loginRequest = await hydraAdmin.getOAuth2LoginRequest({ loginChallenge: challenge })

    if (loginRequest.skip) {
      const { redirect_to } = await hydraAdmin.acceptOAuth2LoginRequest({
        loginChallenge: challenge,
        acceptOAuth2LoginRequest: {
          subject: String(loginRequest.subject),
        },
      })
      res.redirect(String(redirect_to))
      return
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({
        csrfToken: req.csrfToken(),
        challenge,
        hint: loginRequest.oidc_context?.login_hint || "",
        webmailDomain: process.env.WEBMAIL_DOMAIN_WP || "",
        initialError: req.query.error ? String(req.query.error) : "",
      })
    }

    next()
  } catch (err) {
    next(err)
  }
})

/**
 * 2 : Valid KE3
 */
router.post("/", csrfProtection, async (req, res, next) => {
  if (!serverSetup) {
    await opaque.ready
    if (!serverSetup) {
      serverSetup = initServerSetup()
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
  opaqueSessions.delete(opaqueSessionId)

  if (!session || Date.now() > session.expiresAt || session.username !== username) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(401).json({ error: "Invalid authentication payload." })
    }
    return res.redirect(`/login?login_challenge=${challenge}&error=Invalid authentication payload.`)
  }

  let isAuthenticated = false
  try {
    const { sessionKey } = opaque.server.finishLogin({
      finishLoginRequest: opaqueKe3,
      serverLoginState: session.serverLoginState,
    })
    if (sessionKey) isAuthenticated = true
  } catch (err) {
    console.error("Can't validate KE3 OPAQUE:", err)
    isAuthenticated = false
  }

  if (!isAuthenticated) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(401).json({ error: "Incorrect username or password." })
    }
    return res.redirect(`/login?login_challenge=${challenge}&error=Incorrect username or password.`)
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
          Authorization: `Bearer ${process.env.CORE_API_INTERNAL_SECRET}`,
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
        remember_for: 28800,
        acr: loginRequest.oidc_context?.acr_values && loginRequest.oidc_context.acr_values.length > 0 ? loginRequest.oidc_context.acr_values[ loginRequest.oidc_context.acr_values.length - 1 ] : "0",
      },
    })

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ redirect_to })
    }
    res.redirect(String(redirect_to))
  } catch (error) {
    next(error)
  }
})

export default router
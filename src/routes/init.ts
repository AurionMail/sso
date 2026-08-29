// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import urljoin from "url-join"
import csrf from "csurf"
import { Client } from "ldapts"
import * as opaque from "@serenity-kit/opaque"
import { setOpaque, initServerSetup } from "../opaque.js"

const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

const LDAP_URL = process.env.LDAP_URL || "ldap://localhost:3890"
const LDAP_USER_DN_PATTERN = process.env.LDAP_USER_DN_PATTERN || "uid={username},ou=users,dc=domaine,dc=fr"

let serverSetup: string = ""

opaque.ready
  .then(() => {
    serverSetup = initServerSetup()
  })
  .catch((err) => {
    console.error("[OPAQUE] can't init in init.ts:", err)
  })

async function getOrCreateServerSetup(): Promise<string> {
  if (!serverSetup) {
    await opaque.ready
    if (!serverSetup) {
      serverSetup = initServerSetup()
    }
  }
  return serverSetup
}

/**
 * Begin OPAQUE init
 */
router.post("/start", async (req, res) => {
  try {
    const setup = await getOrCreateServerSetup()
    const { registrationRequest, username } = req.body

    if (!registrationRequest) {
      return res.status(400).json({ error: "registrationRequest manquant" })
    }

    const CreateServerRegistrationResponseResult = opaque.server.createRegistrationResponse({
      serverSetup: setup,
      userIdentifier: username || "",
      registrationRequest,
    })

    return res.json(CreateServerRegistrationResponseResult)
  } catch (err) {
    console.error("[OPAQUE] Erreur when calling /init/start:", err)
    return res.status(500).json({ error: "Erreur lors du calcul OPAQUE" })
  }
})

/**
 * Check temp password with Bind LDAP
 */
async function verifyTempPasswordLdap(username: string, tempPassword: string): Promise<boolean> {
  const userDn = LDAP_USER_DN_PATTERN.replace("{username}", username.toLowerCase())
  const client = new Client({ url: LDAP_URL })

  try {
    await client.bind(userDn, tempPassword)
    await client.unbind()
    return true
  } catch (error) {
    console.error(`[LDAP] Error init for user ${userDn}:`, error)
    
    try { 
      await client.unbind() 
    } catch {}

    return false
  }
}

/**
 * GET /init - Métadonnées d'initialisation
 */
router.get("/", csrfProtection, (req, res, next) => {
  const queryUsername = String(req.query.username || req.query.email || "").trim().toLowerCase()
  const queryTempPassword = String(req.query.tempPassword || "")
  const isPreFilled = Boolean(queryUsername && queryTempPassword)

  // API Client Svelte
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({
      csrfToken: req.csrfToken(),
      action: urljoin(process.env.BASE_URL || "", "/init"),
      hint: queryUsername,
      tempPassword: queryTempPassword,
      isPreFilled,
      error: req.query.error ? String(req.query.error) : null,
    })
  }

  // HTML direct -> Passage à Vite / index.html
  next()
})

/**
 * POST /init - Traitement de la finalisation OPAQUE
 */
router.post("/", csrfProtection, async (req, res, next) => {
  const t = req.t || ((key: string) => key)

  const username = String(req.body.username || req.body.email || "").trim().toLowerCase()
  const tempPassword = String(req.body.tempPassword || "")
  const opaqueRegistrationRecord = String(req.body.opaqueRegistrationRecord || "")
  
  const isJson = req.xhr || req.headers.accept?.includes("application/json")

  if (!username || !tempPassword || !opaqueRegistrationRecord) {
    const errorMsg = t("init.errors.requiredFields")
    if (isJson) return res.status(400).json({ success: false, error: errorMsg })
    return res.redirect(`/init?error=${encodeURIComponent(errorMsg)}`)
  }

  try {
    // 1. Validation du mot de passe temporaire via LDAP
    const isTempPasswordValid = await verifyTempPasswordLdap(username, tempPassword)
    if (!isTempPasswordValid) {
      const errorMsg = "Nom d'utilisateur ou mot de passe temporaire invalide."
      if (isJson) return res.status(401).json({ success: false, error: errorMsg })
      return res.redirect(`/init?error=${encodeURIComponent(errorMsg)}`)
    }

    // 2. Transmission du record à l'API Core
    const result = await setOpaque(
      {
        username,
        opaque: opaqueRegistrationRecord,
      },
      t
    )

    if (!result.success) {
      const errorMsg = result.message || t("init.errors.generic")
      if (isJson) return res.status(400).json({ success: false, error: errorMsg })
      return res.redirect(`/init?error=${encodeURIComponent(errorMsg)}`)
    }

    const redirectUrl = String(process.env.WEBMAIL_DOMAIN_WP || "/login")

    if (isJson) {
      return res.json({ success: true, redirect_to: redirectUrl })
    }

    return res.redirect(redirectUrl)
  } catch (error) {
    next(error)
  }
})

export default router
// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import urljoin from "url-join"
import csrf from "csurf"
import { Client } from "ldapts"
import * as opaque from "@serenity-kit/opaque"
import { setOpaque } from "../opaque"

const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

const LDAP_URL = process.env.LDAP_URL || "ldap://localhost:3890"
const LDAP_USER_DN_PATTERN = process.env.LDAP_USER_DN_PATTERN || "uid={username},ou=users,dc=domaine,dc=fr"

let serverSetup: string = ""

function initServerSetup(): string {
  if (process.env.OPAQUE_SERVER_SETUP) {
    return process.env.OPAQUE_SERVER_SETUP
  }
  return 'QcHqVTRjuUfuM8Hlu6Zp6fd8WMDPYdDWekOh4flxWfHBpGTcyn1pS1TCEZNJ5wJ-mXYZjb539WJ9ShzGjyh2BMjhhl8WAOu_qkQ-o1_DX-_22g2Z7UEu1aGDs4-ZaG8LZgLGu41u3XOS9wF12EX0iJU1uzKGo1b-g50ZY4g7hQg'; //opaque.server.createSetup()
}

opaque.ready
  .then(() => {
    serverSetup = initServerSetup()
  })
  .catch((err) => {
    console.error("[OPAQUE] can't init in  init.ts:", err)
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
    const { registrationRequest } = req.body

    if (!registrationRequest) {
      return res.status(400).json({ error: "registrationRequest manquant" })
    }

    const  CreateServerRegistrationResponseResult  = opaque.server.createRegistrationResponse({
      serverSetup: setup,
      userIdentifier: req.body.username || "",
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



router.get("/", csrfProtection, (req: any, res) => {
  const queryUsername = String(req.query.username || req.query.email || "").trim().toLowerCase()
  const queryTempPassword = String(req.query.tempPassword || "")

  const isPreFilled = Boolean(queryUsername && queryTempPassword)

  res.render("init", {
    csrfToken: req.csrfToken(),
    action: urljoin(process.env.BASE_URL || "", "/init"),
    hint: queryUsername,
    tempPassword: queryTempPassword,
    isPreFilled: isPreFilled,
    error: null,
  })
})

router.post("/", csrfProtection, async (req: any, res, next) => {
  const t = req.t || ((key: string) => key)

  const username = String(req.body.username || req.body.email || "").trim().toLowerCase()
  const tempPassword = String(req.body.tempPassword || "")
  const opaqueRegistrationRecord = String(req.body.opaqueRegistrationRecord || "")
  const actionUrl = urljoin(process.env.BASE_URL || "", "/init")
  
  const isPreFilled = req.body.isPreFilled === "true" || (Boolean(username) && Boolean(tempPassword))

  if (!username || !tempPassword || !opaqueRegistrationRecord) {
    return res.render("init", {
      csrfToken: req.csrfToken(),
      action: actionUrl,
      hint: username,
      tempPassword: tempPassword,
      isPreFilled: isPreFilled,
      error: t("init.errors.requiredFields"),
    })
  }

  try {
    // 1. Check temp pass with LDAP
    const isTempPasswordValid = await verifyTempPasswordLdap(username, tempPassword)
    if (!isTempPasswordValid) {
      return res.render("init", {
        csrfToken: req.csrfToken(),
        action: actionUrl,
        hint: username,
        tempPassword: tempPassword,
        isPreFilled: isPreFilled,
        error: t("init.errors.invalidCredentials"),
      })
    }

    // 2. Give record to API core
    const result = await setOpaque(
      {
        username,
        opaque: opaqueRegistrationRecord,
      },
      t
    )

    if (!result.success) {
      return res.render("init", {
        csrfToken: req.csrfToken(),
        action: actionUrl,
        hint: username,
        tempPassword: tempPassword,
        isPreFilled: isPreFilled,
        error: result.message || t("init.errors.generic"),
        webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
      })
    }

    return res.redirect(String(process.env.WEBMAIL_DOMAIN_WP || "/login"))
  } catch (error) {
    next(error)
  }
})

export default router
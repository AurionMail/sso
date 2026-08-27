// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import urljoin from "url-join"
import csrf from "csurf"
import { Client } from "ldapts"

const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

const LDAP_URL = process.env.LDAP_URL || "ldap://localhost:3890"
const LDAP_USER_DN_PATTERN = process.env.LDAP_USER_DN_PATTERN || "uid={username},ou=users,dc=domaine,dc=fr"

/**
 * Check temporary password against LDAP by attempting to bind with the provided username and temporary password.
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
 * Init account by sending SRP salt and verifier to the internal Core API.
 */
async function initializeAccountCoreApi(
  payload: {
    username: string
    tempPassword: string
    srpSalt: string
    srpVerifier: string
  },
  t: (key: string) => string
): Promise<{ success: boolean; message?: string }> {
  const apiUrl = `${process.env.CORE_API_URL}/api/internal/auth/init`

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CORE_API_INTERNAL_SECRET}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 400) {
        return { success: false, message: t("init.errors.invalidCredentials") }
      }
      return { success: false, message: t("init.errors.generic") }
    }

    return { success: true }
  } catch (error) {
    console.error(`[CoreAPI] Error during init for user ${payload.username}:`, error)
    return {
      success: false,
      message: t("init.errors.generic"),
    }
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
  const srpSalt = String(req.body.srpSalt || "")
  const srpVerifier = String(req.body.srpVerifier || "")
  const actionUrl = urljoin(process.env.BASE_URL || "", "/init")
  
  const isPreFilled = req.body.isPreFilled === "true" || (Boolean(username) && Boolean(tempPassword))

  if (!username || !tempPassword || !srpSalt || !srpVerifier) {
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
    // 1. Vérification préalable du mot de passe temporaire via Bind LDAP
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

    // 2. Transmettre les vérificateurs SRP à l'API Core interne
    const result = await initializeAccountCoreApi(
      {
        username,
        tempPassword,
        srpSalt,
        srpVerifier,
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
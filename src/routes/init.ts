// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import urljoin from "url-join"
import csrf from "csurf"
import { Client, Change, Attribute } from "ldapts"

const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

const LDAP_URL = process.env.LDAP_URL || "ldap://localhost:3890"
const LDAP_USER_DN_PATTERN = process.env.LDAP_USER_DN_PATTERN || "uid={username},ou=users,dc=domaine,dc=fr"

/**
 * Met à jour le mot de passe dans LLDAP
 */
async function initializeAccountLdap(
  username: string,
  tempPassword: string,
  newPassword: string,
  t: (key: string) => string
): Promise<{ success: boolean; message?: string }> {
  const userDn = LDAP_USER_DN_PATTERN.replace("{username}", username)
  const client = new Client({ url: LDAP_URL })

  try {
    await client.bind(userDn, tempPassword)

    const change = new Change({
      operation: "replace",
      modification: new Attribute({
        type: "userPassword",
        values: [newPassword],
      }),
    })

    await client.modify(userDn, [change])
    await client.unbind()
    return { success: true }

  } catch (error: any) {
    console.error(`[LDAP] Error init for user ${userDn}:`, error)
    
    try { 
      await client.unbind() 
    } catch {}

    // Erreur d'identifiants
    if (error?.code === 49) {
      return { success: false, message: t("init.errors.invalidCredentials") }
    }

    return { 
      success: false, 
      message: t("init.errors.ldapError") 
    }
  }
}

router.get("/", csrfProtection, (req: any, res) => {
  res.render("init", {
    csrfToken: req.csrfToken(),
    action: urljoin(process.env.BASE_URL || "", "/init"),
    error: null,
  })
})

router.post("/", csrfProtection, async (req: any, res, next) => {
  const t = req.t || ((key: string) => key)

  const username = String(req.body.username || "").trim()
  const tempPassword = String(req.body.tempPassword || "")
  const newPassword = String(req.body.newPassword || "")
  const confirmPassword = String(req.body.confirmPassword || "")
  const actionUrl = urljoin(process.env.BASE_URL || "", "/init")

  // Validations côté serveur
  if (!username || !tempPassword || !newPassword) {
    return res.render("init-account", {
      csrfToken: req.csrfToken(),
      action: actionUrl,
      hint: username,
      error: t("init.errors.requiredFields"),
    })
  }

  if (newPassword !== confirmPassword) {
    return res.render("init-account", {
      csrfToken: req.csrfToken(),
      action: actionUrl,
      hint: username,
      error: t("init.errors.mismatch"),
    })
  }

  if (tempPassword === newPassword) {
    return res.render("init-account", {
      csrfToken: req.csrfToken(),
      action: actionUrl,
      hint: username,
      error: t("init.errors.samePassword"),
    })
  }

  try {
    const result = await initializeAccountLdap(username, tempPassword, newPassword, t)

    if (!result.success) {
      return res.render("init-account", {
        csrfToken: req.csrfToken(),
        action: actionUrl,
        hint: username,
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
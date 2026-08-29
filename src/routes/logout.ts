// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import url from "url"
import urljoin from "url-join"
import csrf from "csurf"
import { hydraAdmin } from "../config.js"

const csrfProtection = csrf({ cookie: true })
const router = express.Router()

/**
 * GET /logout - Demande de déconnexion unitaire
 */
router.get("/", csrfProtection, (req, res, next) => {
  const query = url.parse(req.url, true).query
  const challenge = String(query.logout_challenge || "")

  if (!challenge) {
    next(new Error("Expected a logout challenge to be set but received none."))
    return
  }

  hydraAdmin
    .getOAuth2LogoutRequest({ logoutChallenge: challenge })
    .then(() => {
      // Si appel SPA Fetch -> Envoie JSON
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.json({
          csrfToken: req.csrfToken(),
          challenge,
          action: urljoin(process.env.BASE_URL || "", "/logout"),
          webmailDomain: process.env.WEBMAIL_DOMAIN_WP || "",
          cryptpadDomain: process.env.CRYPTPAD_DOMAIN_WP || "",
        })
      }

      // Si navigation directe -> Délégation au serveur Vite / index.html
      next()
    })
    .catch(next)
})

/**
 * POST /logout - Traitement de la confirmation ou de l'annulation
 */
router.post("/", csrfProtection, (req, res, next) => {
  const challenge = req.body.challenge
  const isJson = req.xhr || req.headers.accept?.includes("application/json")

  if (req.body.submit === "No") {
    return hydraAdmin
      .rejectOAuth2LogoutRequest({ logoutChallenge: challenge })
      .then(() => {
        if (isJson) {
          return res.json({ success: true, action: "close" })
        }
        res.redirect(String('/close-window'))
      })
      .catch(next)
  }

  hydraAdmin
    .acceptOAuth2LogoutRequest({ logoutChallenge: challenge })
    .then(({ redirect_to }: { redirect_to: string }) => {
      if (isJson) {
        return res.json({ success: true, redirect_to: String(redirect_to) })
      }
      res.redirect(String(redirect_to))
    })
    .catch(next)
})

/**
 * GET /logout/all - Page de déconnexion de tous les appareils
 */
router.get("/all", csrfProtection, (req, res, next) => {
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({
      csrfToken: req.csrfToken(),
      action: urljoin(process.env.BASE_URL || "", "/logout/all"),
    })
  }
  next()
})

/**
 * POST /logout/all - Invalidation globale des sessions et tokens
 */
router.post("/all", csrfProtection, async (req, res, next) => {
  const token = req.body.token
  const isJson = req.xhr || req.headers.accept?.includes("application/json")

  if (!token) {
    if (isJson) return res.status(400).json({ error: "Token is required" })
    return res.status(400).render("error", { message: "Token is required." })
  }

  const apiUrl = `${process.env.CORE_API_URL}/api/auth/me`
  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      if (isJson) return res.status(401).json({ error: "Bad token." })
      return res.status(401).render("error", { message: "Bad token." })
    }

    const data = await response.json()
    const username = data.email.split("@")[0]

    // Invalidation des tokens sur l'API Aurion Core
    const invalidateResponse = await fetch(`${process.env.CORE_API_URL}/api/auth/logout`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })

    // Révocation des sessions Hydra
    await hydraAdmin.revokeOAuth2LoginSessions({ subject: username })
    await hydraAdmin.revokeOAuth2ConsentSessions({ subject: username, all: true })

    if (!invalidateResponse.ok) {
      if (isJson) return res.status(500).json({ error: "Failed to invalidate API tokens." })
      return res.status(500).render("error", { message: "Failed to invalidate API tokens." })
    }

    if (isJson) {
      return res.json({ success: true, redirect_to: "/exited" })
    }

    return res.render("exited", { webmailDomain: process.env.WEBMAIL_DOMAIN_WP })
  } catch (error) {
    next(error)
  }
})

export default router
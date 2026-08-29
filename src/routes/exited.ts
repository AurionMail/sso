// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"

const router = express.Router()

router.get("/", (req, res, next) => {
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({
      webmailDomain: process.env.WEBMAIL_DOMAIN_WP || "/"
    })
  }

  // Sinon, passe la main au middleware SPA (index.html)
  next()
})

export default router
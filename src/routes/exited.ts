// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"

const router = express.Router()

router.get("/", (req, res) => {
  res.render("exited", {webmailDomain: process.env.WEBMAIL_DOMAIN_WP})
})

export default router

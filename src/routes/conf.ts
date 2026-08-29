// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import * as opaque from "@serenity-kit/opaque"


const router = express.Router()


/**
 * Begin OPAQUE init
 */
router.get("/", async (req, res) => {
  try {
    await opaque.ready
    const setup = opaque.server.createSetup()

    return res.json({secret: setup})
  } catch (err) {
    console.error("[OPAQUE] Error when generating a secret:", err)
    return res.status(500).json({ error: "Error when generating a secret" })
  }
})

export default router
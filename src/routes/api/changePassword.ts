// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import * as opaque from "@serenity-kit/opaque"
import { setOpaque, initServerSetup, getOpaque } from "../../opaque"
import cors from "cors"

const router = express.Router()
router.use(cors({
  origin: process.env.WEBMAIL_DOMAIN_WP || "http://localhost:3000",
}))

let serverSetup: string = ""

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
 * Begin OPAQUE regiestration init
 */
router.post("/init", async (req, res) => {
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
router.post("/auth", async (req, res) => {
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

/**
 * Change Password : (Check KE3) (API)
 */
router.post("/change", async (req, res, next) => {
   if (!serverSetup) {
      await opaque.ready
      if (!serverSetup) {
        serverSetup = initServerSetup();
      }
    }
  const username = String(req.body.username || "").trim()
  const opaqueSessionId = String(req.body.opaqueSessionId || "")
  const opaqueKe3 = String(req.body.opaqueKe3 || "")

  const session = opaqueSessions.get(opaqueSessionId)
  opaqueSessions.delete(opaqueSessionId)

  if (!session || Date.now() > session.expiresAt || session.username !== username) {
    return res.status(400).json({
      error : "Invalid authentication payload.",
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
    return res.status(400).json({
      error : "Invalid password.",
    })
  }else{
    await setOpaque(
      {
        username,
        opaque: req.body.newRecord,
      },
      (key: string) => key
    )
    return res.json({
      success: true,
    })
  }

})

export default router
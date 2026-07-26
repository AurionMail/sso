// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import url from "url"
import urljoin from "url-join"
import csrf from "csurf"

import { Client } from "ldapts"
import { hydraAdmin } from "../config"
import { oidcConformityMaybeFakeAcr } from "./stub/oidc-cert"

// Sets up csrf protection
const csrfProtection = csrf({
  cookie: {
    sameSite: "lax",
  },
})
const router = express.Router()

// Configuration LDAP via variables d'environnement (avec valeurs par défaut)
const LDAP_URL = process.env.LDAP_URL || "ldap://localhost:389"
const LDAP_USER_DN_PATTERN = process.env.LDAP_USER_DN_PATTERN || "uid={username},ou=users,dc=domaine,dc=fr"

/**
 * Helper d'authentification LDAP (Bind)
 * Vérifie le nom d'utilisateur et le hash Argon2id transmis par le client
 */
async function authenticateWithLdap(username: string, derivedPasswordHash: string): Promise<boolean> {
  const userDn = LDAP_USER_DN_PATTERN.replace("{username}", username)
  const client = new Client({ url: LDAP_URL })

  try {
    console.log(`Tentative de liaison LDAP pour l'utilisateur : ${userDn}`)
    console.log(`Mot de passe dérivé Argon2id : ${derivedPasswordHash}`)
    await client.bind(userDn, derivedPasswordHash)
    await client.unbind()
    return true
  } catch (error) {
    // Si la liaison (bind) échoue, les identifiants ou la clé dérivée sont invalides
    console.error(`Échec de l'authentification LDAP pour l'utilisateur ${userDn}:`, error);
    try {
      await client.unbind()
    } catch {
      // Ignorer l'erreur de fermeture si déjà déconnecté
    }
    return false
  }
}

// Route GET : Affiche la vue ou traite le "skip" si l'utilisateur est déjà connecté
router.get("/", csrfProtection, (req, res, next) => {
  // Parses the URL query
  const query = url.parse(req.url, true).query

  // The challenge is used to fetch information about the login request from ORY Hydra.
  const challenge = String(query.login_challenge)
      /*   if(true){
        res.render("login", {
        csrfToken: req.csrfToken(),
        challenge: challenge,
        action: urljoin(process.env.BASE_URL || "", "/login"),
        hint:  "",
      })
      return;
      } */
  if (!challenge) {
    next(new Error("Expected a login challenge to be set but received none."))
    return
  }

  hydraAdmin
    .getOAuth2LoginRequest({
      loginChallenge: challenge,
    })
    .then((loginRequest) => {
      // If hydra was already able to authenticate the user, skip will be true and we do not need to re-authenticate
      // the user.
      if (loginRequest.skip) {
        // You can apply logic here, for example update the number of times the user logged in.
        // ...

        // Now it's time to grant the login request. You could also deny the request if something went terribly wrong
        // (e.g. your arch-enemy logging in...)
        return hydraAdmin
          .acceptOAuth2LoginRequest({
            loginChallenge: challenge,
            acceptOAuth2LoginRequest: {
              // All we need to do is to confirm that we indeed want to log in the user.
              subject: String(loginRequest.subject),
            },
          })
          .then(({ redirect_to }) => {
            // All we need to do now is to redirect the user back to hydra!
            res.redirect(String(redirect_to))
          })
      }

      // If authentication can't be skipped we MUST show the login UI.
      res.render("login", {
        csrfToken: req.csrfToken(),
        challenge: challenge,
        action: urljoin(process.env.BASE_URL || "", "/login"),
        hint: loginRequest.oidc_context?.login_hint || "",
      })
    })
    // This will handle any error that happens when making HTTP calls to hydra
    .catch(next)
})

  // The challenge is now a hidden input field, so let's take it from the request body instead
router.post("/", csrfProtection, async (req, res, next) => {
  const challenge = req.body.challenge

  // Let's see if the user decided to accept or reject the consent request..
  if (req.body.submit === "Deny access") {
    // Looks like the consent request was denied by the user
    return hydraAdmin
      .rejectOAuth2LoginRequest({
        loginChallenge: challenge,
        rejectOAuth2Request: {
          error: "access_denied",
          error_description: "The resource owner denied the request",
        },
      })
      .then(({ redirect_to }) => {
          // All we need to do now is to redirect the browser back to hydra!
        res.redirect(String(redirect_to))
      })
      .catch(next)
  }

  const username = String(req.body.email || "").trim()
  const derivedPassword = String(req.body.password || "")

  // 2. Validation auprès du serveur LDAP
  const isAuthenticated = await authenticateWithLdap(username, derivedPassword)

  if (!isAuthenticated) {
    // Identifiants ou dérivation Argon2id incorrecte
    return res.render("login", {
      csrfToken: req.csrfToken(),
      challenge: challenge,
      action: urljoin(process.env.BASE_URL || "", "/login"),
      hint: username,
      error: "Identifiant ou mot de passe incorrect.",
    })
  }
  // Seems like the user authenticated! Let's tell hydra...
  // 3. Validation de la connexion auprès d'Ory Hydra
  try {
    const loginRequest = await hydraAdmin.getOAuth2LoginRequest({ loginChallenge: challenge })
    
    const { redirect_to } = await hydraAdmin.acceptOAuth2LoginRequest({
      loginChallenge: challenge,
      acceptOAuth2LoginRequest: {
        // Le `subject` est l'identifiant unique OIDC (username/email transmis à Stalwart/CryptPad)
        subject: username,

        // Mémorisation de la session SSO
        remember: Boolean(req.body.remember),
        remember_for: 28800, // 8 heures de session SSO (3600*8)

        // Contexte additionnel pour la conformité OIDC
        acr: oidcConformityMaybeFakeAcr(loginRequest, "0"),
      },
    })

    // Redirection vers le serveur Hydra
    res.redirect(String(redirect_to))
  } catch (error) {
    next(error)
  }
})

export default router

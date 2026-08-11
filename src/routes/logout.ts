// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express from "express"
import url from "url"
import urljoin from "url-join"
import csrf from "csurf"
import { hydraAdmin } from "../config"

// Sets up csrf protection
const csrfProtection = csrf({ cookie: true })
const router = express.Router()

router.get("/", csrfProtection, (req, res, next) => {
  // Parses the URL query
  const query = url.parse(req.url, true).query

  // The challenge is used to fetch information about the logout request from ORY Hydra.
  const challenge = String(query.logout_challenge)
  if (!challenge) {
    next(new Error("Expected a logout challenge to be set but received none."))
    return
  }

  hydraAdmin
    .getOAuth2LogoutRequest({ logoutChallenge: challenge })
    // This will be called if the HTTP request was successful
    .then(() => {
      // Here we have access to e.g. response.subject, response.sid, ...

      // The most secure way to perform a logout request is by asking the user if he/she really want to log out.
      res.render("logout", {
        csrfToken: req.csrfToken(),
        challenge: challenge,
        action: urljoin(process.env.BASE_URL || "", "/logout"),
        webmailDomain: process.env.WEBMAIL_DOMAIN_WP,
        cryptpadDomain: process.env.CRYPTPAD_DOMAIN_WP,
      })
    })
    // This will handle any error that happens when making HTTP calls to hydra
    .catch(next)
})

router.post("/", csrfProtection, (req, res, next) => {
  // The challenge is now a hidden input field, so let's take it from the request body instead
  const challenge = req.body.challenge

  if (req.body.submit === "No") {
    return (
      hydraAdmin
        .rejectOAuth2LogoutRequest({ logoutChallenge: challenge })
        .then(() => {
          res.render("close_window")
        })
        .catch(next)
    )
  }

  // The user agreed to log out, let's accept the logout request.
  hydraAdmin
    .acceptOAuth2LogoutRequest({ logoutChallenge: challenge })
    .then(({ redirect_to }) => {
      // All we need to do now is to redirect the user back to hydra!
      res.redirect(String(redirect_to))
    })
    // This will handle any error that happens when making HTTP calls to hydra
    .catch(next)
})

router.post("/all",csrfProtection, async (req, res, next) => { 

const token = req.body.token;
if (!token) {
  return res.status(400).json({ error: "Token is required" });
}

const apiUrl = `${process.env.CORE_API_URL}/api/auth/me`;
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

  if (!response.ok) {
      return res.status(401).render("error", { message: "Bad token." });
  }

    const data = await response.json();
    const username = data.email.split('@')[0];

      //invalidate all aurion API tokens of this account :
  const invalidateResponse = await fetch(`${process.env.CORE_API_URL}/api/auth/logout`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  await hydraAdmin.revokeOAuth2LoginSessions({
      subject: username,
    });

    await hydraAdmin.revokeOAuth2ConsentSessions({
      subject: username,
      all: true,
    });

  if (!invalidateResponse.ok) {
    return res.status(500).render("error", { message: "Failed to invalidate API tokens." });
  }

    return res.render("exited", {webmailDomain: process.env.WEBMAIL_DOMAIN_WP})
  } catch (error) {
    next(error)
  }
})

router.get("/all", csrfProtection, (req, res, next) => { 
res.render("logout_all",{csrfToken: req.csrfToken(),} );
});
export default router

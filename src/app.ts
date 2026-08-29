// Copyright © 2025 Ory Corp
// SPDX-License-Identifier: Apache-2.0

import express, { NextFunction, Response, Request } from "express"
import path from "path"
import logger from "morgan"
import cookieParser from "cookie-parser"
import bodyParser from "body-parser"
import i18next from "i18next"
import * as i18nextMiddleware from "i18next-http-middleware"
import Backend from "i18next-fs-backend"

import conf from "./routes/conf.js"
import login from "./routes/login.js"
import logout from "./routes/logout.js"
import device from "./routes/device.js"
import exited from "./routes/exited.js"
import init from "./routes/init.js"
import changePassword from "./routes/api/changePassword.js"
async function initApp() {
const app = express()


// Configuration d'i18next
i18next
  .use(Backend)
  .use(i18nextMiddleware.LanguageDetector)
  .init({
    fallbackLng: "en",
    preload: ["fr", "en"],
    backend: {
      loadPath: path.join(import.meta.dirname, "..", "locales", "{{lng}}", "translation.json"),
    },
    detection: {
      order: ["querystring", "cookie", "header"],
      lookupQuerystring: "lng",
      lookupCookie: "i18next",
      caches: ["cookie"],
    },
  })

app.use(logger("dev"))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/public', express.static(path.join(import.meta.dirname,'..', "public")))

app.use(i18nextMiddleware.handle(i18next))

app.use("/login", login)
app.use("/conf", conf)
app.use("/logout", logout)
app.use("/device", device)
app.use('/exited', exited )
app.use('/init', init)
app.use('/api/changePassword', changePassword)


const isProd = true;
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite")
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    })
    app.use(vite.middlewares)
  } else {
    app.use(express.static(path.join(import.meta.dirname, "..", "dist", "client")))
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(import.meta.dirname, "..", "dist", "client", "index.html"))
    })
  }

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(new Error("Not Found"))
})

// error handlers

// development error handler
// will print stacktrace
if (app.get("env") === "development") {
  app.use((err: Error, req: Request, res: Response) => {
    res.status(500)
    res.render("error", {
      message: err.message,
      error: err,
    })
  })
}

// production error handler
// no stacktraces leaked to user
app.use((err: Error, req: Request, res: Response) => {
  res.status(500)
  res.render("error", {
    message: err.message,
    error: {},
  })
})

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack)
  res.status(500).render("error", {
    message: JSON.stringify(err, null, 2),
  })
})

const listenOn = Number(process.env.PORT || 3000)
app.listen(listenOn, () => {
  console.log(`Listening on http://0.0.0.0:${listenOn}`)
})
}
initApp();
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
import index from "./routes/index.js"
import login from "./routes/login.js"
import logout from "./routes/logout.js"
import device from "./routes/device.js"
import exited from "./routes/exited.js"
import init from "./routes/init.js"
import changePassword from "./routes/api/changePassword.js"
import consent from "./routes/consent.js"
async function initApp() {
const app = express()

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
app.use("/", index)
app.use("/login", login)
app.use("/conf", conf)
app.use("/consent", consent)
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

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Express Error:", err.stack || err)

  const statusCode = err.status || err.statusCode || 500

  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(statusCode).json({
      error: err.message || "Internal Server Error",
    })
  }

  res.status(statusCode).send(`
    <html>
      <head>
        <meta charset="utf-8">
        <title>Erreur ${statusCode}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; background: #f4f4f5; color: #18181b; }
          .card { background: white; padding: 1.5rem; border-radius: 8px; border: 1px solid #e4e4e7; }
          h1 { color: #dc2626; margin-top: 0; font-size: 1.25rem; }
          pre { background: #18181b; color: #f4f4f5; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.875rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Error (${statusCode})</h1>
          <p>${err.message || "Error"}</p>
        </div>
      </body>
    </html>
  `)
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
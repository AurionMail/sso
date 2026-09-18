import { mount } from 'svelte'
import './style.css'
import Login from './pages/Login.svelte'
import Init from './pages/Init.svelte'
import Logout from './pages/Logout.svelte'
import LogoutAll from './pages/LogoutAll.svelte'
import Exited from './pages/Exited.svelte'
import CloseWindow from './pages/CloseWindow.svelte'
import SSO from './pages/SSO.svelte'

async function init() {
  const appTarget = document.getElementById('app')
  if (!appTarget) return

  const pathname = window.location.pathname

  if (pathname === '/close-window') {
  mount(CloseWindow, { target: appTarget })
  return
}

  if (pathname === '/exited') {
    try {
      const res = await fetch('/exited', {
        headers: { 'Accept': 'application/json' }
      })

      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`)

      const data = await res.json()

      mount(Exited, {
        target: appTarget,
        props: {
          webmailDomain: data.webmailDomain || '/',
          externalSSOURL: data.externalSSOURL || ''
        }
      })
    } catch (err) {
      console.error('Erreur lors du montage de /exited :', err)
      mount(Exited, {
        target: appTarget,
        props: { webmailDomain: '/' }
      })
    }
    return
  }

  if (pathname === '/logout/all') {
    try {
      const res = await fetch('/logout/all', {
        headers: { 'Accept': 'application/json' }
      })

      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`)

      const data = await res.json()

      mount(LogoutAll, {
        target: appTarget,
        props: {
          csrfToken: data.csrfToken,
          action: data.action
        }
      })
    } catch (err) {
      console.error('Erreur lors du montage de /logout/all :', err)
      appTarget.innerHTML = `<div class="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm">Impossible de charger la page de déconnexion globale.</div>`
    }
    return
  }

  if (pathname.startsWith('/logout')) {
    try {
        const searchParams = new URLSearchParams(window.location.search)
        const fromExternalSSO = searchParams.get('external_sso') === 'true'

      const res = await fetch(`/logout${window.location.search}`, {
        headers: { 'Accept': 'application/json' }
      })

      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`)

      const data = await res.json()

      mount(Logout, {
        target: appTarget,
        props: {
          csrfToken: data.csrfToken,
          challenge: data.challenge,
          action: data.action,
          fromExternalSSO: fromExternalSSO,
          webmailDomain: data.webmailDomain || '',
          cryptpadDomain: data.cryptpadDomain || ''
        }
      })
    } catch (err) {
      console.error(err)
      appTarget.innerHTML = `<div class="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm">Impossible de charger la page de déconnexion.</div>`
    }
    return
  }

  if (pathname.startsWith('/login/oidc/sso')) {
    const searchParams = new URLSearchParams(window.location.search)

    mount(SSO, {
      target: appTarget,
      props: {
        webmailDomain: searchParams.get('webmail_domain') || '',
        redirect_to: searchParams.get('redirect_to') || '',
        Core_API_token: searchParams.get('core_api_token') || '',
        errorMessage: searchParams.get('error') || ''
      }
    })
    return
  }

  if (pathname.startsWith('/init')) {
    try {
      const res = await fetch(`/init${window.location.search}`, {
        headers: { 'Accept': 'application/json' }
      })

      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`)

      const data = await res.json()

      mount(Init, {
        target: appTarget,
        props: {
          csrfToken: data.csrfToken,
          action: data.action,
          hint: data.hint || '',
          tempPassword: data.tempPassword || '',
          isPreFilled: Boolean(data.isPreFilled),
          initialError: data.error || ''
        }
      })
    } catch (err) {
      console.error(err)
      appTarget.innerHTML = `<div class="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm">Can't load.</div>`
    }
    return
  }

  const searchParams = new URLSearchParams(window.location.search)
  const challenge = searchParams.get('login_challenge')

  if (!challenge) {
    appTarget.innerHTML = `<div class="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm">Not Found</div>`
    return
  }

  try {
    const res = await fetch(`/login?login_challenge=${encodeURIComponent(challenge)}`, {
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!res.ok) {
      throw new Error(`Erreur serveur (${res.status})`)
    }

    const data = await res.json()

    if (data.redirect_to) {
      window.location.href = data.redirect_to
      return
    }

    mount(Login, {
      target: appTarget,
      props: {
        challenge: data.challenge,
        csrfToken: data.csrfToken,
        hint: data.hint || '',
        webmailDomain: data.webmailDomain || '',
        initialError: data.initialError || ''
      }
    })
  } catch (err: any) {
    console.error('Erreur lors du démarrage de l’application Svelte :', err)
    appTarget.innerHTML = `<div class="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm">Impossible de charger la session d'authentification.</div>`
  }
}

init()
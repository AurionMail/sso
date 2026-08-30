<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../lib/i18n.js'

  interface Props {
    csrfToken: string
    challenge: string
    action: string
    webmailDomain?: string
    cryptpadDomain?: string
  }

  let {
    csrfToken,
    challenge,
    action,
    webmailDomain = '',
    cryptpadDomain = ''
  }: Props = $props()

  let isLoading = $state(false)
  let statusMessage = $state($t('logout.subtitle'))
  let isClosed = $state(false)

  const TARGET_BRIDGES = $derived([
    { name: 'Webmail', origin: webmailDomain, path: '/bridge-minimal.html' },
    { name: 'CryptPad', origin: cryptpadDomain, path: '/bridge-minimal.html' }
  ].filter(b => Boolean(b.origin)))

  async function executeApiLogout(submitValue: 'Yes' | 'No') {
    const res = await fetch(action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        _csrf: csrfToken,
        challenge,
        submit: submitValue
      })
    })

    const data = await res.json()

    if (data.action === 'close') {
      isClosed = true
      return
    }

    if (data.redirect_to) {
      window.location.href = data.redirect_to
    }
  }

  function handleCancel() {
    executeApiLogout('No')
  }

  function startLogoutProcess() {
    isLoading = true
    statusMessage = $t('logout.progress')

    try {
      let completedCount = 0
      const totalBridges = TARGET_BRIDGES.length
      const createdIframes: HTMLIFrameElement[] = []

      if (totalBridges === 0) {
        executeApiLogout('Yes')
        return
      }

      const fallbackTimeout = setTimeout(() => {
        console.warn('Timeout : force logout.')
        finishAndSubmit()
      }, 3500)

      function finishAndSubmit() {
        clearTimeout(fallbackTimeout)
        window.removeEventListener('message', handleIframeResponse)

        createdIframes.forEach(iframe => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe)
          }
        })

        executeApiLogout('Yes')
      }

      const handleIframeResponse = (event: MessageEvent) => {
        const isKnownOrigin = TARGET_BRIDGES.some(b => b.origin === event.origin)
        if (!isKnownOrigin) return

        if (event.data && event.data.type === 'LOGOUT_SUCCESS') {
          completedCount++
          if (completedCount >= totalBridges) {
            finishAndSubmit()
          }
        }
      }

      window.addEventListener('message', handleIframeResponse)

      TARGET_BRIDGES.forEach(bridge => {
        const iframe = document.createElement('iframe')
        iframe.src = bridge.origin + bridge.path
        iframe.style.display = 'none'
        createdIframes.push(iframe)

        iframe.onload = () => {
          iframe.contentWindow?.postMessage({ type: 'LOGOUT' }, bridge.origin)
        }

        iframe.onerror = () => {
          console.error(`Can't load iframe : ${bridge.name}`)
          completedCount++
          if (completedCount >= totalBridges) {
            finishAndSubmit()
          }
        }

        document.body.appendChild(iframe)
      })
    } catch (err) {
      console.error('error when propagating logout :', err)
      executeApiLogout('Yes')
    }
  }

  onMount(() => {
    if (localStorage.getItem('force_logout') === 'true') {
      localStorage.removeItem('force_logout')
      startLogoutProcess()
    }
  })
</script>

<div class="rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden w-full max-w-md">
  {#if isClosed}
    <div class="px-8 py-10 text-center space-y-3">
      <h1 class="text-xl font-semibold text-foreground">Fenêtre prête à être fermée</h1>
      <p class="text-sm text-muted-foreground">La déconnexion a été annulée. Vous pouvez fermer cet onglet.</p>
    </div>
  {:else}
    <div class="px-8 pt-10 pb-6 text-center">
      <div class="inline-flex items-center justify-center mb-5 w-16 h-16 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" x2="9" y1="12" y2="12"></line>
        </svg>
      </div>
      <h1 class="text-2xl font-semibold text-foreground tracking-tight">{$t('logout.title')}</h1>
      <p class="text-sm text-muted-foreground mt-1.5">{statusMessage}</p>
    </div>

    <div class="px-8 pb-8 space-y-3">
      <button
        onclick={startLogoutProcess}
        disabled={isLoading}
        class="inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-destructive-foreground px-4 py-2 w-full h-11 font-medium text-[15px] bg-destructive hover:bg-destructive/90 transition-all duration-200 rounded-xl shadow-md shadow-destructive/15 hover:shadow-lg hover:shadow-destructive/20 cursor-pointer"
      >
        <div class="flex items-center gap-2">
          {#if isLoading}
            <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{$t('logout.progress')}</span>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" x2="9" y1="12" y2="12"></line>
            </svg>
            <span>{$t('logout.confirm')}</span>
          {/if}
        </div>
      </button>

      <button
        onclick={handleCancel}
        disabled={isLoading}
        class="inline-flex items-center justify-center w-full h-10 px-4 text-xs font-medium text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted/50 rounded-xl transition-colors duration-200 cursor-pointer"
      >
        {$t('logout.cancel')}
      </button>
    </div>
  {/if}
</div>
<!-- src/client/pages/Login.svelte -->
<script lang="ts">
  import * as opaque from '@serenity-kit/opaque'
  import { argon2id } from 'hash-wasm'
  import { processSecret, sendSecretToWebmailBridge } from '../lib/crypto.js'
  import { t } from '../lib/i18n.js'

  interface Props {
    challenge: string
    csrfToken: string
    hint?: string
    webmailDomain: string
    initialError?: string
    t?: (key: string) => string
  }

  let {
    challenge,
    csrfToken,
    hint = '',
    webmailDomain,
    initialError = '',
  }: Props = $props()

  let username = $state('')
  let password = $state('')
  let remember = $state(false)
  let isLoading = $state(false)
  let errorMessage = $state('')

  let secretInput = $state('')
  let secretIdInput = $state('')
  let loginTokenInput = $state('')
  let opaqueSessionIdInput = $state('')
  let opaqueKe3Input = $state('')
  let btnSubmitInput = $state('Log in')

  let formRef: HTMLFormElement

   $effect.pre(() => {
    username = hint
    errorMessage = initialError
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    
    const submitter = e.submitter as HTMLButtonElement | null
    if (submitter && submitter.value) {
      btnSubmitInput = submitter.value
    }
    if (btnSubmitInput === "Deny access") {
      setTimeout(() => formRef.submit(), 0)
      return
    }

    isLoading = true
    errorMessage = ''

    try {
      const salt = new TextEncoder().encode(`auth_salt_${username.trim()}`)
      const hashedPassword = await argon2id({
        password,
        salt,
        parallelism: 1,
        iterations: 3,
        memorySize: 65536,
        hashLength: 32,
        outputType: 'hex',
      })

      const { startLoginRequest, clientLoginState } = opaque.client.startLogin({
        password: hashedPassword,
      })

      const initRes = await fetch('/login/opaque/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          startLoginRequest,
        }),
      })

      if (!initRes.ok) {
        throw new Error('Erreur challenge OPAQUE')
      }

      const { sessionId, loginResponse } = await initRes.json()

      const result = opaque.client.finishLogin({
        clientLoginState,
        loginResponse,
        password: hashedPassword,
      })

      if (!result) {
        errorMessage = $t('login.invalidCredentials')
        isLoading = false
        return
      }
      const finishLoginRequest = result.finishLoginRequest
      const sessionKey = result.sessionKey

      const { ciphertextHex, ivHex, seedHex } = await processSecret(password)
      const id = crypto.randomUUID()
      const loginToken = crypto.randomUUID()

      if (webmailDomain) {
        await sendSecretToWebmailBridge(
          webmailDomain,
          id,
          seedHex,
          ivHex,
          loginToken
        )
      }

      secretInput = ciphertextHex
      secretIdInput = id
      loginTokenInput = loginToken
      opaqueSessionIdInput = sessionId
      opaqueKe3Input = finishLoginRequest

      password = ''

      setTimeout(() => {
        formRef.submit()
      }, 0)
    } catch (err) {
      console.error(err)
      errorMessage = $t('login.invalidCredentials')
      isLoading = false
    }
  }
</script>

<div class="rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden w-full max-w-md">
  <div class="px-8 pt-10 pb-6 text-center">
    <div class="inline-flex items-center justify-center mb-5 w-16 h-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8" aria-hidden="true">
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>
    <h1 id="login-title" class="text-2xl font-semibold text-foreground tracking-tight">{$t('login.title')}</h1>
    <p class="text-sm text-muted-foreground mt-1.5">{$t('login.subtitle')}</p>
  </div>

  <div class="px-8 pb-8">
    {#if errorMessage}
      <div class="mb-5 p-3 rounded-xl border border-destructive/20 bg-destructive/5 flex items-start gap-3" role="alert" aria-live="polite">
        <div class="w-10 h-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center flex-shrink-0 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
        </div>
        <div class="flex-1 min-w-0 self-center flex items-center gap-2">
          <p class="text-sm text-destructive flex-1 leading-relaxed">{errorMessage}</p>
        </div>
      </div>
    {/if}

    <form bind:this={formRef} action="/login" method="POST" onsubmit={handleSubmit} class="space-y-5">
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="challenge" value={challenge} />
      <input type="hidden" name="secret" value={secretInput} />
      <input type="hidden" name="secretId" value={secretIdInput} />
      <input type="hidden" name="loginToken" value={loginTokenInput} />
      <input type="hidden" name="opaqueSessionId" value={opaqueSessionIdInput} />
      <input type="hidden" name="opaqueKe3" value={opaqueKe3Input} />
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="remember" value={remember ? "true" : ""} />
      <input type="hidden" name="btn_submit" value={btnSubmitInput} />

      <fieldset class="space-y-4">
        <div class="space-y-1.5">
          <label for="username" class="block text-sm font-medium text-foreground">{$t('login.username')}</label>
          <div class="relative">
            <input
              type="text"
              id="username"
              bind:value={username}
              required
              autocomplete="username"
              disabled={isLoading}
              class="flex w-full border py-2 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 h-11 px-3.5 bg-muted/40 border-border/60 rounded-xl focus:bg-background focus:border-primary/50 transition-all duration-200"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <label for="password" class="block text-sm font-medium text-foreground">{$t('login.password')}</label>
          <div class="relative">
            <input
              type="password"
              id="password"
              name="password"
              bind:value={password}
              required
              autocomplete="current-password"
              disabled={isLoading}
              class="flex w-full border py-2 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 h-11 px-3.5 bg-muted/40 border-border/60 rounded-xl focus:bg-background focus:border-primary/50 transition-all duration-200"
            />
          </div>
        </div>

        <label class="flex items-center gap-2.5 cursor-pointer group select-none pt-1">
          <span class="relative flex items-center justify-center">
            <input
              type="checkbox"
              id="remember_checkbox"
              bind:checked={remember}
              disabled={isLoading}
              class="peer sr-only"
            />
            <span class="flex items-center justify-center w-4.5 h-4.5 rounded-[5px] border border-border/80 bg-muted/40 peer-checked:bg-primary peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background transition-all duration-200"></span>
          </span>
          <span class="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{$t('login.rememberMe')}</span>
        </label>
      </fieldset>

      <div class="space-y-3 pt-1">
        <button
          type="submit"
          id="accept"
          value="Log in"
          disabled={isLoading}
          class="inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 text-primary-foreground px-4 py-2 w-full h-11 font-medium text-[15px] bg-primary hover:bg-primary/90 transition-all duration-200 rounded-xl shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/20 cursor-pointer"
        >
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true">
              <path d="m10 17 5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            </svg>
            <span>{isLoading ? $t('login.progress') : $t('login.submit')}</span>
          </div>
        </button>

        <button
          type="submit"
          id="reject"
          value="Deny access"
          disabled={isLoading}
          class="inline-flex items-center justify-center w-full h-10 px-4 text-xs font-medium text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted/50 rounded-xl transition-colors duration-200 cursor-pointer"
        >
          {$t('login.denyAccess')}
        </button>
      </div>
    </form>
  </div>
</div>
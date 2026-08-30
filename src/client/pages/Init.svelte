<script lang="ts">
  import * as opaque from '@serenity-kit/opaque'
  import { argon2id } from 'hash-wasm'
  import { t } from '../lib/i18n.js'
  interface Props {
    csrfToken: string
    action: string
    hint?: string
    tempPassword?: string
    isPreFilled?: boolean
    initialError?: string
  }

  let {
    csrfToken,
    action,
    hint = '',
    tempPassword: defaultTempPassword = '',
    isPreFilled = false,
    initialError = ''
  }: Props = $props()

  // Svelte 5 Runes
  let username = $state('')
  let tempPassword = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')
  let errorMessage = $state('')
  let isLoading = $state(false)

  $effect.pre(() => {
    username = hint
    tempPassword = defaultTempPassword
    errorMessage = initialError
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    errorMessage = ''

    const cleanUsername = username.trim().toLowerCase()

    if (!cleanUsername || !tempPassword || !newPassword) {
      errorMessage = $t('init.errors.mismatch')
      return
    }

    if (newPassword !== confirmPassword) {
      errorMessage = $t('init.errors.mismatch')
      return
    }

    if (tempPassword === newPassword) {
      errorMessage = $t('init.errors.samePassword')
      return
    }

    isLoading = true

    try {
      const salt = new TextEncoder().encode(`auth_salt_${cleanUsername}`)
      

      const hashedPassword = await argon2id({
        password: newPassword,
        salt: salt,
        parallelism: 1,
        iterations: 3,
        memorySize: 65536,
        hashLength: 32,
        outputType: 'hex',
      })

      await opaque.ready
      const { registrationRequest, clientRegistrationState } = opaque.client.startRegistration({
        password: hashedPassword
      })

      const startRes = await fetch('/init/start', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          username: cleanUsername,
          registrationRequest
        })
      })

      if (!startRes.ok) {
        throw new Error($t('init.errors.crypto'))
      }

      const { registrationResponse } = await startRes.json()

      const { registrationRecord: opaqueRegistrationRecord } = opaque.client.finishRegistration({
        clientRegistrationState,
        registrationResponse,
        password: hashedPassword
      })

      const res = await fetch(action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          _csrf: csrfToken,
          username: cleanUsername,
          tempPassword,
          opaqueRegistrationRecord,
          isPreFilled: isPreFilled ? "true" : "false"
        })
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || $t('init.errors.crypto'))
      }

      window.location.href = data.redirect_to

    } catch (err: any) {
      console.error('Erreur init crypto :', err)
      errorMessage = err.message || $t('init.errors.crypto')
      isLoading = false
    }
  }
</script>

<div class="rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden w-full max-w-md">
  <div class="px-8 pt-10 pb-6 text-center">
    <div class="inline-flex items-center justify-center mb-5 w-16 h-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8">
        <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"></path>
        <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"></circle>
      </svg>
    </div>
    <h1 class="text-2xl font-semibold text-foreground tracking-tight">{$t('init.title')}</h1>
    <p class="text-sm text-muted-foreground mt-1.5">{$t('init.subtitle')}</p>
  </div>

  <div class="px-8 pb-8">
    {#if errorMessage}
      <div class="mb-5 p-3 rounded-xl border border-destructive/20 bg-destructive/5 flex items-start gap-3" role="alert">
        <div class="w-10 h-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center flex-shrink-0 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" x2="12" y1="8" y2="12"></line>
            <line x1="12" x2="12.01" y1="16" y2="16"></line>
          </svg>
        </div>
        <div class="flex-1 min-w-0 self-center flex items-center gap-2">
          <p class="text-sm text-destructive flex-1 leading-relaxed">{errorMessage}</p>
        </div>
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-4">
      <fieldset class="space-y-4" disabled={isLoading}>
        <div class="space-y-1.5">
          <label for="username" class="block text-sm font-medium text-foreground">{$t('init.username')}</label>
          <div class="relative">
            {#if isPreFilled}
              <input
                type="text"
                id="username"
                bind:value={username}
                readonly
                tabindex="-1"
                class="flex w-full border py-2 text-sm text-foreground opacity-70 cursor-not-allowed select-none h-11 px-3.5 bg-muted/60 border-border/60 rounded-xl focus:outline-none"
              />
            {:else}
              <input
                type="text"
                id="username"
                bind:value={username}
                required
                autocomplete="username"
                class="flex w-full border py-2 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring h-11 px-3.5 bg-muted/40 border-border/60 rounded-xl focus:bg-background focus:border-primary/50 transition-all duration-200"
              />
            {/if}
          </div>
        </div>

        {#if !isPreFilled}
          <div class="space-y-1.5">
            <label for="tempPassword" class="block text-sm font-medium text-foreground">{$t('init.tempPassword')}</label>
            <div class="relative">
              <input
                type="password"
                id="tempPassword"
                bind:value={tempPassword}
                required
                autocomplete="current-password"
                class="flex w-full border py-2 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring h-11 px-3.5 bg-muted/40 border-border/60 rounded-xl focus:bg-background focus:border-primary/50 transition-all duration-200"
              />
            </div>
          </div>
        {/if}

        <div class="space-y-1.5">
          <label for="newPassword" class="block text-sm font-medium text-foreground">{$t('init.newPassword')}</label>
          <div class="relative">
            <input
              type="password"
              id="newPassword"
              bind:value={newPassword}
              required
              autocomplete="new-password"
              class="flex w-full border py-2 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring h-11 px-3.5 bg-muted/40 border-border/60 rounded-xl focus:bg-background focus:border-primary/50 transition-all duration-200"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <label for="confirmPassword" class="block text-sm font-medium text-foreground">{$t('init.newPassword')}</label>
          <div class="relative">
            <input
              type="password"
              id="confirmPassword"
              bind:value={confirmPassword}
              required
              autocomplete="new-password"
              class="flex w-full border py-2 text-sm text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring h-11 px-3.5 bg-muted/40 border-border/60 rounded-xl focus:bg-background focus:border-primary/50 transition-all duration-200"
            />
          </div>
        </div>
      </fieldset>

      <div class="space-y-3 pt-3">
        <button
          type="submit"
          disabled={isLoading}
          class="inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-primary-foreground px-4 py-2 w-full h-11 font-medium text-[15px] bg-primary hover:bg-primary/90 transition-all duration-200 rounded-xl shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/20 cursor-pointer"
        >
          <div class="flex items-center gap-2">
            {#if isLoading}
              <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{$t('init.progress')}</span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>{$t('init.submit')}</span>
            {/if}
          </div>
        </button>
      </div>
    </form>
  </div>
</div>
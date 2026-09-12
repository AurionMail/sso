<!-- src/client/pages/SSO.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { sendSecretToWebmailBridge } from '../lib/crypto.js'
  import { t } from '../lib/i18n.js'

  interface Props {
    redirect_to: string
    Core_API_token: string
    webmailDomain: string
    errorMessage: string
  }

  let {
    redirect_to,
    Core_API_token,
    webmailDomain,
    errorMessage,
  }: Props = $props()

  onMount(async () => {
    if (errorMessage) return

    try {
      if (webmailDomain && Core_API_token) {
        await sendSecretToWebmailBridge(
          webmailDomain,
          'SSO_LOGIN',
          'SSO_LOGIN',
          'SSO_LOGIN',
          Core_API_token
        )
      }
    } catch (err) {
      console.error( err)
    } finally {
      if (redirect_to) {
        window.location.href = redirect_to
      }
    }
  })
</script>

<div class="rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden w-full max-w-md">
  <div class="px-8 pt-10 pb-6 text-center">
    <div class="inline-flex items-center justify-center mb-5 w-16 h-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 animate-pulse" aria-hidden="true">
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
  </div>
</div>
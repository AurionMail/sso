<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../lib/i18n.js'

  let failedToClose = $state(false)

  function attemptClose() {
    window.close()
    setTimeout(() => {
      failedToClose = true
    }, 300)
  }

  onMount(() => {
    attemptClose()
  })
</script>

<div class="rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm shadow-xl shadow-black/5 dark:shadow-black/20 overflow-hidden w-full max-w-md p-8 text-center space-y-4">
  <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-muted text-muted-foreground border border-border/60 shadow-sm mx-auto">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true">
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  </div>

  <h1 class="text-2xl font-semibold text-foreground tracking-tight">
    {$t('closeWindow.title')}
  </h1>
  
  <p class="text-sm text-muted-foreground leading-relaxed">
    {$t('closeWindow.subtitle')}
  </p>

  {#if failedToClose}
    <div class="pt-2">
      <button
        onclick={attemptClose}
        class="inline-flex items-center justify-center w-full h-10 px-4 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-xl transition-colors duration-200 cursor-pointer"
      >
        {$t('closeWindow.button')}
      </button>
    </div>
  {/if}
</div>
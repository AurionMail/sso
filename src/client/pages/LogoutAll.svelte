<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../lib/i18n.js'

  interface Props {
    csrfToken: string
    action: string
  }

  let { csrfToken, action }: Props = $props()

  let statusText = $state("")
  let errorMessage = $state('')

  const DB_NAME = 'AurionAuth'
  const AURION_STORE = 'keys'
  const KEY = 'token'

  function getTokenFromIndexedDB(): Promise<string | null> {
    return new Promise(resolve => {
      const req = indexedDB.open(DB_NAME)

      req.onsuccess = (e: any) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(AURION_STORE)) {
          db.close()
          return resolve(null)
        }

        const transaction = db.transaction(AURION_STORE, 'readonly')
        const store = transaction.objectStore(AURION_STORE)
        const getReq = store.get(KEY)

        getReq.onsuccess = () => {
          db.close()
          resolve(getReq.result || null)
        }

        getReq.onerror = () => {
          db.close()
          resolve(null)
        }
      }

      req.onerror = () => resolve(null)
    })
  }

  onMount(async () => {
    try {
      const token = await getTokenFromIndexedDB()
      statusText = ''

      const res = await fetch(action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          _csrf: csrfToken,
          token: token || ''
        })
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error)
      }

      if (data.redirect_to) {
        window.location.href = data.redirect_to
      }
    } catch (err: any) {
      console.error(err)
      errorMessage = err.message
    }
  })
</script>

<div class="w-full max-w-md bg-background border border-border/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 p-6 space-y-6">
  <div class="flex flex-col space-y-1.5 text-center">
    <h3 class="text-2xl font-semibold tracking-tight text-foreground">{$t('logoutG.title')}</h3>
    <p class="text-sm text-muted-foreground">{$t('logoutG.subtitle')}</p>
  </div>

  {#if errorMessage}
    <div class="p-3 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm text-center">
      {errorMessage}
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center py-6 space-y-4">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <p class="text-sm font-medium text-muted-foreground">{statusText}</p>
    </div>
  {/if}
</div>
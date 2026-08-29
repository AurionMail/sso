// src/client/lib/crypto.ts
const ENCRYPTION_ALGO = 'AES-GCM'
const HKDF_SALT = new Uint8Array(16)

async function deriveKeyFromSeed(seedBytes: Uint8Array): Promise<CryptoKey> {
  // Transtypage explicite de seedBytes.buffer en ArrayBuffer
  const hkdfMasterKey = await window.crypto.subtle.importKey(
    'raw',
    seedBytes.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveKey']
  )

  return await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: new TextEncoder().encode('AURION-0K-SECRET-V1'),
    },
    hkdfMasterKey,
    { name: ENCRYPTION_ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Adapter bufferToHex pour accepter TypedArray ou ArrayBuffer
function bufferToHex(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function processSecret(secretValue: string) {
  const seed = window.crypto.getRandomValues(new Uint8Array(32))
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKeyFromSeed(seed)
  const encodedSecret = new TextEncoder().encode(secretValue)

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { 
      name: 'AES-GCM', 
      iv: iv.buffer as ArrayBuffer 
    },
    key,
    encodedSecret
  )

  return {
    ciphertextHex: bufferToHex(ciphertextBuffer),
    ivHex: bufferToHex(iv),
    seedHex: bufferToHex(seed),
  }
}

export function sendSecretToWebmailBridge(
  webmailDomain: string,
  id: string,
  seedHex: string,
  ivHex: string,
  loginToken: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.src = `${webmailDomain}/bridge-minimal.html`
    iframe.style.display = 'none'
    document.body.appendChild(iframe)

    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Bridge Webmail timeout'))
    }, 5000)

    function cleanup() {
      clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
      if (iframe.parentNode) {
        document.body.removeChild(iframe)
      }
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== webmailDomain) return
      if (event.data && event.data.type === 'WRITE_SUCCESS') {
        cleanup()
        resolve()
      }
    }

    window.addEventListener('message', handleMessage)

    iframe.onload = () => {
      iframe.contentWindow?.postMessage(
        {
          type: 'WRITE_SECRET',
          secret: { id, seed: seedHex, iv: ivHex },
          login_token: loginToken,
        },
        webmailDomain
      )
    }
  })
}
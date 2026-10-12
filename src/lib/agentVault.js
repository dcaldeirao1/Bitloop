/**
 * Passphrase-encrypted storage helpers (PBKDF2 + AES-GCM).
 * Private keys are never written to disk in plaintext.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const PBKDF2_ITERATIONS = 310_000
const SALT_BYTES = 16
const IV_BYTES = 12
const MIN_PASSPHRASE_LEN = 8

export function validatePassphrase(passphrase, { confirm } = {}) {
  const p = String(passphrase || '')
  if (p.length < MIN_PASSPHRASE_LEN) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LEN} characters.`)
  }
  if (confirm != null && p !== String(confirm)) {
    throw new Error('Passphrases do not match.')
  }
  return p
}

function bytesToBase64(bytes) {
  let binary = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i])
  return btoa(binary)
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

async function deriveAesKey(passphrase, saltBytes) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * @returns {{ salt: string, iv: string, ciphertext: string }} base64 fields
 */
export async function encryptSecret(passphrase, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveAesKey(passphrase, salt)
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  }
}

export async function decryptSecret(passphrase, payload) {
  if (!payload?.salt || !payload?.iv || !payload?.ciphertext) {
    throw new Error('Encrypted agent payload is incomplete.')
  }
  const salt = base64ToBytes(payload.salt)
  const iv = base64ToBytes(payload.iv)
  const ciphertext = base64ToBytes(payload.ciphertext)
  const key = await deriveAesKey(passphrase, salt)
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )
    return decoder.decode(plainBuf)
  } catch {
    throw new Error('Wrong passphrase (or corrupted agent vault).')
  }
}

export const AGENT_PASSPHRASE_MIN = MIN_PASSPHRASE_LEN

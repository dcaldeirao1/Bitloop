const BASE = (import.meta.env.VITE_RELAYER_URL || 'http://localhost:8787').replace(/\/$/, '')

async function relayerFetch(path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Relayer error (${res.status})`)
  }
  return data
}

export function createSmartAccount(token) {
  return relayerFetch('/create-account', { token })
}

export function configureSplit(token, payload) {
  return relayerFetch('/configure-split', { token, body: payload })
}

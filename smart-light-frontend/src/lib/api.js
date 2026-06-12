export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

async function parseResponse(res) {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return res.json()
  }

  const text = await res.text()
  return text ? { message: text } : null
}

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const DEFAULT_TIMEOUT = 10000 // 10 detik

export async function apiFetch(path, { token, headers = {}, body, timeout = DEFAULT_TIMEOUT, signal, ...options } = {}) {
  const finalHeaders = {
    Accept: 'application/json',
    ...headers,
  }

  // Buat AbortController untuk timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // Gabungkan signal user dengan timeout signal
  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  const requestInit = {
    ...options,
    headers: finalHeaders,
    signal: controller.signal,
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`
  }

  if (body !== undefined) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
    if (isFormData) {
      requestInit.body = body
    } else {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json'
      requestInit.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
  }

  try {
    const url = `${BASE_URL}${path}`
    const res = await fetch(url, requestInit)
    const data = await parseResponse(res)

    if (!res.ok) {
      const message =
        data?.message ||
        data?.error ||
        `Request gagal dengan status ${res.status}`

      throw new ApiError(message, res.status, data)
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('Request timeout — server tidak merespons', 408)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function getErrorMessage(error, fallback = 'Terjadi kesalahan saat menghubungi server.') {
  if (error instanceof ApiError) {
    return error.message || fallback
  }

  if (error instanceof Error) {
    return error.message || fallback
  }

  return fallback
}

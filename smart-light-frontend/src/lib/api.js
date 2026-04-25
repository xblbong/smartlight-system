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

export async function apiFetch(path, { token, headers = {}, body, ...options } = {}) {
  const finalHeaders = {
    Accept: 'application/json',
    ...headers,
  }

  const requestInit = {
    ...options,
    headers: finalHeaders,
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

  const res = await fetch(path, requestInit)
  const data = await parseResponse(res)

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Request gagal dengan status ${res.status}`

    throw new ApiError(message, res.status, data)
  }

  return data
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

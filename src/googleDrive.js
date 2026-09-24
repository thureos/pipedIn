import { googleClientId } from './config.js'

const clientId = () => googleClientId()
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const BACKUP_NAME = 'pipedIn-backup.json'
const TOKEN_KEY = 'pipedin.google.token'
const FILE_KEY = 'pipedin.google.fileId'
let tokenClient
let scriptPromise

function loadIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = resolve
      script.onerror = () => reject(new Error('Unable to load Google sign-in. Check your network connection.'))
      document.head.append(script)
    })
  }
  return scriptPromise
}

function requireClientId() {
  if (!clientId()) throw new Error('Google Drive is not configured. Add VITE_GOOGLE_CLIENT_ID to the app environment.')
}

async function getToken() {
  requireClientId()
  await loadIdentityScript()
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: DRIVE_SCOPE,
      callback: () => {}
    })
  }
  const stored = localStorage.getItem(TOKEN_KEY)
  if (stored) {
    try {
      const token = JSON.parse(stored)
      if (token.expiresAt > Date.now() + 60000) return token.accessToken
    } catch {}
  }
  return new Promise((resolve, reject) => {
    tokenClient.callback = response => {
      if (response.error) { reject(new Error(response.error_description || 'Google authorization was not completed.')); return }
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 }))
      resolve(response.access_token)
    }
    tokenClient.requestAccessToken({ prompt: stored ? '' : 'consent' })
  })
}

async function driveRequest(path, options = {}) {
  const accessToken = await getToken()
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...options.headers } })
  if (!response.ok) {
    if (response.status === 401) localStorage.removeItem(TOKEN_KEY)
    const detail = await response.text()
    throw new Error(`Google Drive request failed (${response.status}). ${detail.slice(0, 160)}`)
  }
  return response.status === 204 ? null : response.json()
}

async function findBackup() {
  const configuredId = localStorage.getItem(FILE_KEY)
  if (configuredId) {
    try { return await driveRequest(`files/${encodeURIComponent(configuredId)}?fields=id,name,modifiedTime`) } catch { localStorage.removeItem(FILE_KEY) }
  }
  const query = encodeURIComponent(`name = '${BACKUP_NAME}' and trashed = false`)
  const result = await driveRequest(`files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)&pageSize=1`)
  const file = result.files?.[0] || null
  if (file) localStorage.setItem(FILE_KEY, file.id)
  return file
}

function multipartBody(metadata, content) {
  const boundary = `pipedin-${crypto.randomUUID()}`
  const body = [`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`, `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n`, `--${boundary}--`].join('')
  return { body, contentType: `multipart/related; boundary=${boundary}` }
}

export async function saveToGoogleDrive(applications) {
  const content = JSON.stringify({ version: 1, applications }, null, 2)
  const existing = await findBackup()
  const metadata = existing ? { name: BACKUP_NAME } : { name: BACKUP_NAME, parents: ['appDataFolder'] }
  const multipart = multipartBody(metadata, content)
  const endpoint = existing ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
  const accessToken = JSON.parse(localStorage.getItem(TOKEN_KEY)).accessToken
  const response = await fetch(endpoint, { method: existing ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': multipart.contentType }, body: multipart.body })
  if (!response.ok) throw new Error(`Unable to save the Google Drive backup (${response.status}).`)
  const file = await response.json()
  localStorage.setItem(FILE_KEY, file.id)
  return file
}

export async function restoreFromGoogleDrive() {
  const file = await findBackup()
  if (!file) throw new Error('No pipedIn backup was found in your Google Drive.')
  const backup = await driveRequest(`files/${encodeURIComponent(file.id)}?alt=media`)
  if (backup?.version !== 1 || !Array.isArray(backup.applications)) throw new Error('The Google Drive file is not a valid pipedIn backup.')
  return backup
}

export function googleDriveConfigured() { return Boolean(clientId()) }
export function googleDriveConnected() { return Boolean(localStorage.getItem(TOKEN_KEY)) }
export function disconnectGoogleDrive() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(FILE_KEY) }

export function googleClientId() {
  return window.__PIPEDIN_CONFIG__?.googleClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}

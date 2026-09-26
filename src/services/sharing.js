export function encodeApplicationShare(application) {
  const bytes = new TextEncoder().encode(JSON.stringify(application))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeApplicationShare(input) {
  let value = String(input ?? '').trim()
  try {
    const url = new URL(value)
    value = url.searchParams.get('share') || url.hash.match(/(?:^#|&)share=([^&]+)/)?.[1] || ''
    if (value) value = decodeURIComponent(value)
  } catch {}
  if (!value) throw new Error('Paste a Base64 application share or a job posting URL.')
  try {
    const binary = atob(value.replace(/\s/g, ''))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('This does not look like a valid Base64 application share.')
  }
}

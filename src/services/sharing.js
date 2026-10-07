export function encodeApplicationShare(application) {
  const bytes = new TextEncoder().encode(JSON.stringify(application))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function looksLikeSourceCode(value) {
  return /^(?:#!|\/\/|\/\*|<\?php|<!doctype html|<html\b|<script\b|import\s+[\w{*"' ]|export\s+(?:default|const|function|class)|(?:const|let|var)\s+\w+\s*=|function\s+\w*\s*\(|class\s+\w+|def\s+\w+\s*\(|#include\b|package\s+[\w.]+;)/i.test(
    value.trim(),
  )
}

export function decodeApplicationShare(input) {
  let value = String(input ?? '').trim()
  try {
    const url = new URL(value)
    value = url.searchParams.get('share') || url.hash.match(/(?:^#|&)share=([^&]+)/)?.[1] || ''
    if (value) value = decodeURIComponent(value)
  } catch {}
  if (!value) throw new Error('Paste a Base64 application share or a job posting URL.')
  if (looksLikeSourceCode(value))
    throw new Error(
      'This looks like source code, not a Base64 application share. Paste the Base64 share instead.',
    )

  let decoded
  try {
    const binary = atob(value.replace(/\s/g, ''))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    decoded = new TextDecoder().decode(bytes)
  } catch {
    throw new Error('This does not look like a valid Base64 application share.')
  }
  try {
    return JSON.parse(decoded)
  } catch {
    if (looksLikeSourceCode(decoded))
      throw new Error(
        'This looks like source code, not a Base64 application share. Paste the Base64 share instead.',
      )
    throw new Error('This does not look like a valid Base64 application share.')
  }
}

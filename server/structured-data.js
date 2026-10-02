import { parseDocument } from 'htmlparser2'
import { decodeHTML } from 'entities'

const tokens = (value = '') => value.trim().split(/\s+/).filter(Boolean)

// Parse data only: never execute page scripts or load linked contexts/resources.
export function embeddedJobData(html) {
  const document = parseDocument(html)
  const nodes = []
  const pending = [...document.children].reverse()
  while (pending.length && nodes.length < 50000) {
    const node = pending.pop()
    nodes.push(node)
    if (node.children && !['script', 'style', 'template'].includes(node.name))
      for (let i = node.children.length - 1; i >= 0; i -= 1) pending.push(node.children[i])
  }
  const data = []
  for (const node of nodes) {
    const type = node.attribs?.type?.split(';')[0].trim().toLowerCase()
    if (node.name !== 'script' || type !== 'application/ld+json') continue
    let text = (node.children || [])
      .map((child) => child.data || '')
      .join('')
      .trim()
    if (text.startsWith('<!--') && text.endsWith('-->')) text = text.slice(4, -3).trim()
    if (text.startsWith('<![CDATA[') && text.endsWith(']]>')) text = text.slice(9, -3).trim()
    try {
      data.push(JSON.parse(text))
    } catch {
      // Some publishers incorrectly HTML-escape JSON inside script elements.
      try {
        data.push(JSON.parse(decodeHTML(text)))
      } catch {
        /* Try the next block. */
      }
    }
  }

  const byId = new Map(
    nodes.filter((node) => node.attribs?.id).map((node) => [node.attribs.id, node]),
  )
  let visited = 0
  function textValue(node) {
    const parts = []
    const stack = [node]
    while (stack.length && visited++ < 100000) {
      const current = stack.pop()
      if (['script', 'style', 'template'].includes(current.name)) continue
      if (current.type === 'text') parts.push(current.data)
      else if (current.children) {
        for (let i = current.children.length - 1; i >= 0; i -= 1) stack.push(current.children[i])
        if (current.name === 'br') parts.push(' ')
      }
    }
    return parts.join('')
  }
  function item(root, depth = 0, ancestors = new Set()) {
    if (depth > 32 || ancestors.has(root) || visited++ >= 100000) return null
    const nextAncestors = new Set(ancestors).add(root)
    const result = Object.create(null)
    result['@type'] = tokens(root.attribs.itemtype)
    if (root.attribs.itemid) result['@id'] = root.attribs.itemid
    const stack = [...(root.children || [])].reverse()
    for (const id of tokens(root.attribs.itemref)) if (byId.has(id)) stack.push(byId.get(id))
    const seen = new Set()
    while (stack.length && visited++ < 100000) {
      const node = stack.pop()
      if (seen.has(node) || nextAncestors.has(node)) continue
      seen.add(node)
      if (['script', 'style', 'template'].includes(node.name)) continue
      const attrs = node.attribs || {}
      const properties = tokens(attrs.itemprop)
      const scoped = Object.hasOwn(attrs, 'itemscope')
      if (properties.length) {
        const value = scoped
          ? item(node, depth + 1, nextAncestors)
          : (attrs.content ??
            attrs.datetime ??
            attrs.href ??
            attrs.src ??
            attrs.value ??
            textValue(node))
        for (const property of properties) {
          if (!Object.hasOwn(result, property)) result[property] = value
          else result[property] = [result[property], value].flat()
        }
      }
      if (!scoped && node.children)
        for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i])
    }
    return result
  }
  for (const node of nodes) {
    if (
      Object.hasOwn(node.attribs || {}, 'itemscope') &&
      tokens(node.attribs.itemtype).some((type) =>
        /^https?:\/\/schema\.org\/JobPosting\/?$/.test(type),
      )
    )
      data.push(item(node))
  }
  return data
}

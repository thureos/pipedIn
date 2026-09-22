export const cardColors = ['blue', 'orange', 'yellow', 'green']
export const employmentTypes = ['Full-time', 'Part-time', 'Contract', 'Contract-to-hire', 'Temporary', 'Internship', 'Freelance', 'Apprenticeship', 'Other']
export const stages = [
  { id: 'potential', name: 'Potential applications', color: '#a092b5' },
  { id: 'applied', name: 'Applied', color: '#7a9f94' },
  { id: 'reached', name: 'Reached out', color: '#7a9eb7' },
  { id: 'interviews', name: 'Interviews', color: '#bd9a65' },
  { id: 'offer', name: 'Offer received', color: '#669c76' },
  { id: 'accepted', name: 'Offer accepted', color: '#428375' },
  { id: 'declined', name: 'Offer declined', color: '#b38a9b' },
  { id: 'rejected', name: 'Rejected', color: '#bc8580' },
  { id: 'withdrawn', name: 'Withdrawn', color: '#979aa0' },
]
export const endingOutcomes = [
  { id: 'declined', name: 'Declined' },
  { id: 'rejected', name: 'Rejected' },
  { id: 'withdrawn', name: 'Withdrawn' },
  { id: 'accepted', name: 'Accepted' },
]
export const columnForStage = stage => endingOutcomes.some(outcome => outcome.id === stage) ? 'ended' : stage
export const boardStages = [...stages.filter(stage => columnForStage(stage.id) !== 'ended'), { id: 'ended', name: 'Ended', color: '#979aa0' }]
export const reasonLabels = { declined: 'Reason for declining', rejected: 'Reason for rejection', withdrawn: 'Reason for withdrawal', accepted: 'Reason for accepting' }
export function blankApplication() {
  return { id: crypto.randomUUID(), company: '', title: '', location: '', business: '', salary: '', workplace: 'Remote', color: '', starred: false, employmentType: '', stage: 'applied', date: new Date().toISOString().slice(0, 10), url: '', notes: '', perks: [], attributes: [], interviews: [], reasons: { declined: '', rejected: '', withdrawn: '' }, createdAt: null, updatedAt: null, stageEnteredAt: null, stageHistory: [] }
}
export function ageLabel(timestamp, now = Date.now()) {
  if (!timestamp) return 'Age unknown'
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}
export function stampApplication(item, previous, now = new Date().toISOString()) {
  const moved = !previous || previous.stage !== item.stage
  return { ...item, createdAt: previous ? previous.createdAt : now, updatedAt: now,
    stageEnteredAt: moved ? now : previous.stageEnteredAt,
    stageHistory: moved ? [...(previous?.stageHistory || []), { stage: item.stage, enteredAt: now }] : previous.stageHistory }
}
export function isApplicationUrl(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false }
}
export function validateApplications(items) {
  if (!Array.isArray(items) || items.length > 10000) throw new Error('Choose a valid pipedIn backup.')
  const ids = new Set()
  return items.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || ids.has(item.id) || !stages.some(s => s.id === item.stage)) throw new Error('The backup contains invalid or duplicate applications.')
    ids.add(item.id)
    if (item.color !== undefined && item.color !== '' && !cardColors.includes(item.color)) throw new Error('The backup contains an invalid card color.')
    if (item.starred !== undefined && typeof item.starred !== 'boolean') throw new Error('The backup contains an invalid star setting.')
    if (item.employmentType !== undefined && item.employmentType !== '' && !employmentTypes.includes(item.employmentType)) throw new Error('The backup contains an invalid employment type.')
    for (const key of ['company', 'title', 'location', 'business', 'salary', 'workplace', 'date', 'url', 'notes']) if (typeof item[key] !== 'string') throw new Error('The backup has missing or invalid fields.')
    if (!item.company.trim() || (item.stage !== 'potential' && !item.title.trim()) || (item.stage === 'potential' && !isApplicationUrl(item.url)) || !['Remote', 'Onsite', 'Hybrid'].includes(item.workplace)) throw new Error('The backup has invalid application details.')
    if (!Array.isArray(item.perks) || !item.perks.every(p => typeof p === 'string') || !Array.isArray(item.attributes) || !item.attributes.every(a => a && typeof a.name === 'string' && typeof a.value === 'string')) throw new Error('The backup contains invalid custom fields.')
    if (!Array.isArray(item.interviews) || !item.interviews.every(i => i && ['id', 'name', 'person', 'date', 'notes'].every(k => typeof i[k] === 'string') && Number.isInteger(i.rating) && i.rating >= 0 && i.rating <= 5)) throw new Error('The backup contains invalid interviews.')
    if (!item.reasons || !['declined', 'rejected', 'withdrawn'].every(k => typeof item.reasons[k] === 'string')) throw new Error('The backup contains invalid outcome reasons.')
    const validTimestamp = value => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)))
    for (const key of ['createdAt', 'updatedAt', 'stageEnteredAt']) if (item[key] !== undefined && !validTimestamp(item[key])) throw new Error('The backup contains invalid timestamps.')
    if (item.stageHistory !== undefined && (!Array.isArray(item.stageHistory) || !item.stageHistory.every(entry => entry && stages.some(s => s.id === entry.stage) && validTimestamp(entry.enteredAt)))) throw new Error('The backup contains invalid stage history.')
    // Earlier versions did not record these events. Keep unknown dates honest.
    return { ...structuredClone(item), color: item.color ?? '', starred: item.starred ?? false, employmentType: item.employmentType ?? '', createdAt: item.createdAt ?? null, updatedAt: item.updatedAt ?? null, stageEnteredAt: item.stageEnteredAt ?? null, stageHistory: item.stageHistory ?? [] }
  })
}
export function demoApplications() {
  return [
    ['Linear', 'Senior Product Designer', 'San Francisco, CA', 'Productivity software', '$160k – $190k', 'Remote', 'applied', ['401k', 'Stocks']],
    ['Notion', 'Product Designer', 'New York, NY', 'Collaboration software', '$145k – $175k', 'Hybrid', 'applied', ['PTO', 'Stocks']],
    ['Figma', 'Design Engineer', 'San Francisco, CA', 'Design tools', '$170k – $210k', 'Remote', 'applied', ['401k', 'PTO']],
    ['Vercel', 'Senior UX Designer', 'San Francisco, CA', 'Developer tools', '$150k – $185k', 'Remote', 'reached', ['Stocks', 'PTO']],
    ['Headspace', 'Product Designer', 'Santa Monica, CA', 'Health & wellness', '$130k – $160k', 'Hybrid', 'reached', ['401k', 'Wellness budget']],
    ['Stripe', 'Product Designer', 'San Francisco, CA', 'Financial technology', '$165k – $200k', 'Hybrid', 'interviews', ['401k', 'Stocks', 'PTO']],
    ['Are.na', 'Design Engineer', 'Brooklyn, NY', 'Creative tools', '$140k – $170k', 'Remote', 'interviews', ['PTO']],
    ['Calm', 'Senior Product Designer', 'San Francisco, CA', 'Health & wellness', '$155k – $180k', 'Remote', 'offer', ['401k', 'PTO', 'Stocks']],
  ].map(([company,title,location,business,salary,workplace,stage,perks], index) => stampApplication({ ...blankApplication(), company,title,location,business,salary,workplace,stage,perks, date: new Date(Date.now() - (index + 1) * 86400000).toISOString().slice(0,10), interviews: stage === 'interviews' ? [{ id: crypto.randomUUID(), name: 'Portfolio review', person: 'Design team', date: '', notes: '', rating: 4 }] : [] }, null, new Date(Date.now() - (index + 1) * 86400000).toISOString()))
}

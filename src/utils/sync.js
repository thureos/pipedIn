import { validateApplications } from '../domain/applications.js'

// Existing records always win; sync only adds IDs absent from the destination.
export function addMissingApplications(existing, incoming) {
  const ids = new Set(existing.map((application) => application.id))
  return validateApplications(
    JSON.parse(
      JSON.stringify([...existing, ...incoming.filter((application) => !ids.has(application.id))]),
    ),
  )
}

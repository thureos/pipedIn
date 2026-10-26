// Use calendar dates in UTC so week boundaries do not depend on DST or timezone.
export function addCalendarDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value.getTime()))
    throw new Error('Choose a valid starting date.')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function workSearchWeeks(applications, date, count = 1) {
  const selected = addCalendarDays(date, 0)
  const sunday = addCalendarDays(selected, -new Date(`${selected}T00:00:00Z`).getUTCDay())
  return Array.from(
    { length: Math.min(52, Math.max(1, Math.floor(Number(count)) || 1)) },
    (_, index) => {
      const start = addCalendarDays(sunday, index * 7)
      const end = addCalendarDays(start, 6)
      return {
        start,
        applications: applications
          .filter(
            (application) =>
              application.date >= start &&
              application.date <= end &&
              (application.stage !== 'potential' ||
                application.stageHistory?.some((entry) => entry.stage === 'applied')),
          )
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
    },
  )
}

export function paginateWorkSearchWeeks(weeks) {
  return weeks.flatMap((week, weekIndex) => {
    const pageCount = Math.max(1, Math.ceil(week.rows.length / 5))
    return Array.from({ length: pageCount }, (_, pageIndex) => ({
      ...week,
      weekNumber: weekIndex + 1,
      pageNumber: pageIndex + 1,
      pageCount,
      rows: week.rows.slice(pageIndex * 5, pageIndex * 5 + 5),
    }))
  })
}

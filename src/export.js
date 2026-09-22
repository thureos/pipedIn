import { stages } from './data.js'

function csvCell(value) {
  let text = String(value ?? '')
  // Keep user-entered values as text when opened in a spreadsheet.
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function applicationsCsv(applications) {
  const rows = [['Company / opportunity', 'Job title', 'Current status', 'Application link', 'Company location', 'Work arrangement', 'Employment type', 'Business', 'Salary', 'Applied on', 'Created at', 'Last updated at', 'Current stage entered at', 'Outcome reason', 'Card color', 'Starred']]
  for (const item of applications) {
    rows.push([item.company, item.title, stages.find(stage => stage.id === item.stage)?.name ?? item.stage,
      item.url, item.location, item.workplace, item.employmentType, item.business, item.salary, item.date,
      item.createdAt, item.updatedAt, item.stageEnteredAt, item.reasons?.[item.stage], item.color, item.starred ? 'Yes' : 'No'])
  }
  // UTF-8 BOM helps Excel recognize names with non-ASCII characters.
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

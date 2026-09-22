import { defineStore } from 'pinia'
import { ref } from 'vue'
import { validateApplications, demoApplications, stampApplication } from './data.js'
export const useApplications = defineStore('applications', () => {
  const applications = ref([])
  const error = ref('')
  try {
    const saved = localStorage.getItem('pipedin.applications.v1')
    if (saved) applications.value = validateApplications(JSON.parse(saved))
  } catch { error.value = 'Your saved data could not be loaded. Export or recover your existing browser data before saving changes.' }
  function commit(next) {
    try { localStorage.setItem('pipedin.applications.v1', JSON.stringify(next)); applications.value = next; error.value = ''; return true }
    catch { error.value = 'Unable to save. Browser storage may be full or disabled. Export your data and free up storage, then try again.'; return false }
  }
  function save(item) {
    const next = structuredClone(applications.value.map(a => JSON.parse(JSON.stringify(a))))
    const index = next.findIndex(a => a.id === item.id)
    const stamped = stampApplication(item, next[index])
    if (index < 0) next.push(stamped); else next[index] = stamped
    return commit(next)
  }
  function move(id, stage) { const item = applications.value.find(a => a.id === id); return item ? save({ ...JSON.parse(JSON.stringify(item)), stage }) : false }
  return { applications, error, save, move, remove: id => commit(applications.value.filter(a => a.id !== id)), replace: items => commit(validateApplications(items)), demo: () => commit(demoApplications()) }
})

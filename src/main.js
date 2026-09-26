import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app/App.vue'
import './styles/app.css'
import './styles/features.css'
createApp(App).use(createPinia()).mount('#app')

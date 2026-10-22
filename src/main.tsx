import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { ensureMeta, requestPersistentStorage } from './db/persist'
import './index.css'

void requestPersistentStorage()
void ensureMeta()

const root = document.getElementById('root')
if (!root) throw new Error('Нет корневого элемента')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { startPersistence } from './state/persistenceStore'

const stopPersistence = startPersistence()
if (import.meta.hot) import.meta.hot.dispose(stopPersistence)

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)

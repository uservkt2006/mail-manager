import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from './theme'
import './index.css'

applyTheme()
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

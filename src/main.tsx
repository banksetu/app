import { isAndroid, startAndroidRuntime } from "./platform/android/runtime";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

startAndroidRuntime();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (!isAndroid() && 'serviceWorker' in navigator && location.protocol === 'https:') {
  void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline application cache unavailable', error));
}

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import pkg from './package.json'

// https://vite.dev/config/
// حقن بيانات البناء (قاعدة المالك 2026-11-25): الإصدار من package.json ووقت
// البناء لحظة تشغيله — سطر «الإصدار X — نُشر …» في الواجهة يُبنى منهما آليًا.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})

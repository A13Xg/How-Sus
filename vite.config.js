import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || ''
const isUserOrOrgPagesRepo = repoName.endsWith('.github.io')

// https://vite.dev/config/
export default defineConfig({
  base:
    process.env.GITHUB_ACTIONS === 'true'
      ? (isUserOrOrgPagesRepo ? '/' : `/${repoName}/`)
      : '/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})

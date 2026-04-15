import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || ''
const isUserOrOrgPagesRepo = repoName.endsWith('.github.io')

// https://vite.dev/config/
export default defineConfig({
  base:
    process.env.GITHUB_ACTIONS === 'true'
      ? (isUserOrOrgPagesRepo ? '/' : `/${repoName}/`)
      : '/',
  plugins: [react()],
})

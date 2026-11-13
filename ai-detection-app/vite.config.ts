import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function versionedInferenceAssets(): Plugin {
  let publicDir = '', outDir = ''
  let files: string[] = []
  return {
    name: 'versioned-inference-assets',
    apply: 'build',
    configResolved(config) {
      publicDir = path.resolve(config.root, 'public')
      outDir = path.resolve(config.root, config.build.outDir)
      const manifest = JSON.parse(fs.readFileSync(path.resolve(config.root, 'src/inference/model-manifest.json'), 'utf8'))
      const runtime = JSON.parse(fs.readFileSync(path.resolve(config.root, 'model-assets/runtime-hashes.json'), 'utf8'))
      files = [
        '/favicon.svg', '/icons.svg', manifest.model.url, manifest.tokenizer.url,
        manifest.tokenizerConfig.url, manifest.modelConfig.url,
        '/artifacts/' + manifest.id + '/manifest.json',
        ...runtime.map((asset: { url: string }) => asset.url),
      ]
    },
    writeBundle() {
      for (const file of files) {
        const relative = file.replace(/^\//, '')
        const source = path.join(publicDir, relative)
        const dest = path.join(outDir, relative)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(source, dest)
      }
    },
  }
}
// Dev serves existing public files; builds only package the selected manifest.
// prepare:model verifies generated assets; legacy public/model stays untouched.
export default defineConfig({
  plugins: [react(), versionedInferenceAssets()],
  build: { copyPublicDir: false },
})

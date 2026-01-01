#!/usr/bin/env bun
/**
 * Build script for the EasyEDA Component Browser
 * Bundles browser TypeScript and inlines it into the HTML template
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

const ROOT = dirname(dirname(import.meta.path))
const SRC_DIR = join(ROOT, 'src')
const DIST_DIR = join(ROOT, 'dist')
const ASSETS_DIR = join(DIST_DIR, 'assets')

async function buildSearchPage() {
  console.log('Building search page...')

  // Ensure dist/assets directory exists
  if (!existsSync(ASSETS_DIR)) {
    mkdirSync(ASSETS_DIR, { recursive: true })
  }

  // Bundle browser TypeScript
  console.log('Bundling browser code...')
  const result = await Bun.build({
    entrypoints: [join(SRC_DIR, 'browser/index.ts')],
    target: 'browser',
    minify: true,
    sourcemap: 'none',
  })

  if (!result.success) {
    console.error('Build failed:')
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  // Get bundled JavaScript
  const bundledJs = await result.outputs[0].text()
  console.log(`Bundled JS size: ${(bundledJs.length / 1024).toFixed(1)} KB`)

  // Read HTML template
  const templatePath = join(SRC_DIR, 'assets/search.html')
  const template = readFileSync(templatePath, 'utf-8')

  // Replace placeholder with bundled JS
  // Use function replacer to avoid $& being interpreted as special replacement pattern
  const html = template.replace('/* {{INLINE_JS}} */', () => bundledJs)

  // Write output
  const outputPath = join(ASSETS_DIR, 'search.html')
  writeFileSync(outputPath, html)
  console.log(`Written: ${outputPath}`)

  // Also copy to src/assets for development (routes.ts looks there too)
  const devOutputPath = join(SRC_DIR, 'assets/search-built.html')
  writeFileSync(devOutputPath, html)
  console.log(`Written: ${devOutputPath}`)

  console.log('Search page build complete!')
}

buildSearchPage().catch((error) => {
  console.error('Build error:', error)
  process.exit(1)
})

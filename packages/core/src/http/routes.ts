/**
 * HTTP routes for the EasyEDA Component Browser
 * Handles serving the HTML page and proxying API requests
 *
 * Returns KiCad S-expression strings for symbol/footprint preview rendering
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { IncomingMessage, ServerResponse } from 'http'
import { createLogger } from '../utils/logger.js'
import type { EasyEDAComponentData, EasyEDACommunityComponent } from '../types/index.js'
import { easyedaCommunityClient } from '../api/easyeda-community.js'
import { symbolConverter } from '../converter/symbol.js'
import { footprintConverter } from '../converter/footprint.js'

const logger = createLogger('http-routes')

// Get the directory of this file to find assets
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Cache the HTML content in memory
let htmlCache: string | null = null

/**
 * Load the HTML page from the assets directory
 */
function getHtmlPage(): string {
  if (htmlCache) return htmlCache

  try {
    // When bundled, __dirname points to dist/ since everything is in index.js
    // When running from source, __dirname is src/http/
    const possiblePaths = [
      // Bundled: dist/index.js looking for dist/assets/search.html
      join(__dirname, 'assets/search.html'),
      // Bundled alternative path
      join(__dirname, '../dist/assets/search.html'),
      // Source: src/http/ looking for src/assets/
      join(__dirname, '../assets/search.html'),
      join(__dirname, '../assets/search-built.html'),
      // From project root (core package)
      join(process.cwd(), 'dist/assets/search.html'),
      join(process.cwd(), 'packages/core/dist/assets/search.html'),
      // When imported from other packages
      join(__dirname, '../../dist/assets/search.html'),
      // When bundled into CLI or other package, look for core's assets relative to monorepo
      join(__dirname, '../../../core/dist/assets/search.html'),
      join(__dirname, '../../../../packages/core/dist/assets/search.html'),
      // Look in node_modules if installed as dependency
      join(__dirname, '../../node_modules/@jlcpcb/core/dist/assets/search.html'),
    ]

    for (const path of possiblePaths) {
      try {
        htmlCache = readFileSync(path, 'utf-8')
        logger.debug(`Loaded HTML from: ${path}`)
        return htmlCache
      } catch {
        // Try next path
      }
    }

    throw new Error('HTML file not found')
  } catch (error) {
    logger.error('Failed to load HTML page:', error)
    return `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
<h1>Error: Search page not found</h1>
<p>The search page has not been built. Run: bun run build</p>
</body>
</html>`
  }
}

/**
 * Main request handler
 */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  logger.debug(`${req.method} ${pathname}`)

  // Route requests
  if (pathname === '/' || pathname === '/index.html') {
    const query = url.searchParams.get('q') || undefined
    serveHtml(res, query)
  } else if (pathname === '/api/search') {
    await handleSearch(url, res)
  } else if (pathname.startsWith('/api/component/')) {
    const uuid = pathname.replace('/api/component/', '')
    await handleComponent(uuid, res)
  } else if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }
}

/**
 * Serve the HTML page with optional initial query injection
 */
function serveHtml(res: ServerResponse, initialQuery?: string): void {
  let html = getHtmlPage()

  if (initialQuery) {
    // Inject initial query via a script tag before </head>
    const script = `<script>window.__INITIAL_QUERY__ = ${JSON.stringify(initialQuery)};</script>`
    html = html.replace('</head>', `${script}</head>`)
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

/**
 * Handle search API requests
 * GET /api/search?q=query&source=user|lcsc|all&page=1&limit=20
 */
async function handleSearch(
  url: URL,
  res: ServerResponse
): Promise<void> {
  const query = url.searchParams.get('q') || ''
  const source = url.searchParams.get('source') || 'user'
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const limit = parseInt(url.searchParams.get('limit') || '20', 10)

  if (!query) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing query parameter' }))
    return
  }

  try {
    // Fetch more than we need for pagination (EasyEDA doesn't support offset)
    const allResults = await easyedaCommunityClient.search({
      query,
      source: source as 'user' | 'lcsc' | 'easyeda' | 'all',
      limit: Math.min(limit * page + limit, 100), // Max 100 results
    })

    // Calculate pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const results = allResults.slice(startIndex, endIndex)
    const totalPages = Math.ceil(allResults.length / limit)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      results,
      pagination: {
        page,
        limit,
        total: allResults.length,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    }))
  } catch (error) {
    logger.error('Search error:', error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Search failed' }))
  }
}

/**
 * Convert EasyEDACommunityComponent to EasyEDAComponentData format
 * Required because converters expect the LCSC-style structure
 */
function communityToComponentData(
  community: EasyEDACommunityComponent
): EasyEDAComponentData {
  // Extract component info from the head c_para
  const cPara = community.symbol.head?.c_para as Record<string, string> | undefined ?? {}
  const fpCPara = community.footprint.head?.c_para as Record<string, string> | undefined ?? {}

  return {
    info: {
      name: community.title || cPara.name || 'Unknown',
      prefix: cPara.pre || cPara.Prefix || 'U',
      package: fpCPara.package || community.footprint.name,
      manufacturer: cPara.Manufacturer || cPara.BOM_Manufacturer,
      description: community.description || cPara.BOM_Manufacturer_Part,
      category: cPara.package, // Best guess for category
    },
    symbol: community.symbol,
    footprint: community.footprint,
    model3d: community.model3d,
    rawData: community.rawData,
  }
}

/**
 * Handle component fetch API requests
 * GET /api/component/:uuid
 *
 * Returns KiCad S-expression strings for browser-side rendering
 */
async function handleComponent(
  uuid: string,
  res: ServerResponse
): Promise<void> {
  if (!uuid) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing UUID' }))
    return
  }

  try {
    const component = await easyedaCommunityClient.getComponent(uuid)

    if (!component) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Component not found' }))
      return
    }

    // Convert community component to converter-compatible format
    const componentData = communityToComponentData(component)

    // Generate KiCad S-expression strings using existing converters
    let symbolSexpr = ''
    let footprintSexpr = ''

    try {
      // Get just the symbol entry (not the full library wrapper)
      symbolSexpr = symbolConverter.convertToSymbolEntry(componentData)
    } catch (e) {
      logger.warn('Symbol conversion failed:', e)
    }

    try {
      footprintSexpr = footprintConverter.convert(componentData)
    } catch (e) {
      logger.warn('Footprint conversion failed:', e)
    }

    // Return S-expr strings for browser rendering
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      uuid: component.uuid,
      title: component.title,
      description: component.description,
      owner: component.owner,
      symbolSexpr,
      footprintSexpr,
      model3d: component.model3d,
    }))
  } catch (error) {
    logger.error('Component fetch error:', error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Failed to fetch component' }))
  }
}

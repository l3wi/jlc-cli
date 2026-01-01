/**
 * EasyEDA Community Library MCP Tools
 * Search and 3D model download for community-contributed components
 */

import { z } from 'zod'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { easyedaCommunityClient } from '@jlcpcb/core'
import { join } from 'path'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

// Tool Definitions

export const easyedaSearchTool: Tool = {
  name: 'easyeda_search',
  description:
    'Search EasyEDA community library for user-contributed symbols and footprints. Use this for parts not in LCSC official library (e.g., XIAO, Arduino modules, custom breakouts). Returns results with UUIDs and optionally opens an HTML preview.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search term (e.g., "XIAO RP2040", "ESP32-C3 module")',
      },
      source: {
        type: 'string',
        enum: ['user', 'lcsc', 'easyeda', 'all'],
        description:
          'Filter by source. "user" for community-contributed (default)',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default: 20)',
      },
      open_preview: {
        type: 'boolean',
        description: 'Generate and open HTML preview in browser',
        default: true,
      },
    },
    required: ['query'],
  },
}

export const easyedaGet3DModelTool: Tool = {
  name: 'easyeda_get_3d_model',
  description:
    'Download 3D model for an EasyEDA community component. Requires the model UUID from easyeda_get.',
  inputSchema: {
    type: 'object',
    properties: {
      uuid: {
        type: 'string',
        description: '3D model UUID from easyeda_get result',
      },
      format: {
        type: 'string',
        enum: ['step', 'obj'],
        description: 'Model format: "step" or "obj" (default: step)',
      },
    },
    required: ['uuid'],
  },
}

// Zod Schemas

const EasyedaSearchParamsSchema = z.object({
  query: z.string().min(1),
  source: z.enum(['user', 'lcsc', 'easyeda', 'all']).optional(),
  limit: z.number().min(1).max(100).optional(),
  open_preview: z.boolean().optional(),
})

const EasyedaGet3DModelParamsSchema = z.object({
  uuid: z.string().min(1),
  format: z.enum(['step', 'obj']).default('step'),
})

// Tool Handlers

export async function handleEasyedaSearch(args: unknown) {
  const params = EasyedaSearchParamsSchema.parse(args)
  const openPreview = params.open_preview ?? true

  const results = await easyedaCommunityClient.search({
    query: params.query,
    source: params.source,
    limit: params.limit || 20,
  })

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `No results found for "${params.query}"`,
        },
      ],
    }
  }

  // Generate text output
  let output = `Found ${results.length} results for "${params.query}":\n\n`
  output += '| # | Title | Package | Owner | UUID |\n'
  output += '|---|-------|---------|-------|------|\n'

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    output += `| ${i + 1} | ${r.title} | ${r.package} | ${r.owner.nickname || r.owner.username} | ${r.uuid} |\n`
  }

  output += '\nUse `library_fetch` with the UUID to add component to global JLC-MCP libraries.'
  output += '\nUse `easyeda_fetch` with the UUID to add to project-local EasyEDA library.'

  // Generate HTML preview
  if (openPreview) {
    const { filepath, browserOpened } = await generateHtmlPreview(params.query, results)
    if (browserOpened) {
      output += `\n\nHTML preview opened in browser.`
    } else {
      output += `\n\nCould not open browser automatically.`
    }
    output += `\nPreview file: ${filepath}`
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: output,
      },
    ],
  }
}

export async function handleEasyedaGet3DModel(args: unknown) {
  const params = EasyedaGet3DModelParamsSchema.parse(args)

  const model = await easyedaCommunityClient.get3DModel(
    params.uuid,
    params.format
  )

  if (!model) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `3D model ${params.uuid} not found`,
        },
      ],
      isError: true,
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: `3D model downloaded (${model.length} bytes, ${params.format.toUpperCase()} format)\n\nBase64 data:\n${model.toString('base64').slice(0, 500)}...`,
      },
    ],
  }
}

// Helper Functions

/**
 * Generate HTML preview file and open it in browser
 * Fetches component details to generate SVG previews for both symbol and footprint
 * Returns the filepath and whether the browser was successfully opened
 */
async function generateHtmlPreview(
  query: string,
  results: Awaited<ReturnType<typeof easyedaCommunityClient.search>>
): Promise<{ filepath: string; browserOpened: boolean }> {
  const timestamp = Date.now()
  const filename = `easyeda-search-${timestamp}.html`
  const filepath = join(tmpdir(), filename)

  // No-image placeholder SVG
  const noImageSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" style="background:#2a2a2a"><text x="100" y="75" text-anchor="middle" fill="#666" font-size="12">No Preview</text></svg>`
  const noImageDataUri = `data:image/svg+xml,${encodeURIComponent(noImageSvg)}`

  // Generate cards with symbol thumbnail URL and footprint SVG
  const cardsPromises = results.slice(0, 10).map(async (r) => {
    // Symbol image: use EasyEDA's thumbnail URL
    const symbolImageUrl = `https://image.easyeda.com/components/${r.uuid}.png`

    // Footprint: generate SVG from shape data (need to fetch component details)
    let footprintSvg = ''
    try {
      const component = await easyedaCommunityClient.getComponent(r.uuid)
      if (component) {
        const rawData = component.rawData as any
        // For docType 2: footprint in packageDetail.dataStr
        // For docType 4: footprint in top-level dataStr
        const fpDataStr = rawData?.packageDetail?.dataStr || rawData?.dataStr
        if (fpDataStr?.shape) {
          footprintSvg = generateFootprintSvg(fpDataStr)
        }
      }
    } catch {
      // Ignore fetch errors, show placeholder
    }

    const footprintDataUri = footprintSvg ? `data:image/svg+xml,${encodeURIComponent(footprintSvg)}` : noImageDataUri

    return `
    <div class="card">
      <div class="images">
        <div class="image-box">
          <div class="image-label">Symbol</div>
          <img src="${symbolImageUrl}" alt="Symbol" onerror="this.src='${noImageDataUri}'">
        </div>
        <div class="image-box">
          <div class="image-label">Footprint</div>
          <img src="${footprintDataUri}" alt="Footprint">
        </div>
      </div>
      <h3>${escapeHtml(r.title)}</h3>
      <div class="meta">
        <div><strong>Package:</strong> ${escapeHtml(r.package || 'N/A')}</div>
        <div><strong>Owner:</strong> ${escapeHtml(r.owner.nickname || r.owner.username)}</div>
        ${r.manufacturer ? `<div><strong>Mfr:</strong> ${escapeHtml(r.manufacturer)}</div>` : ''}
      </div>
      <div class="uuid" onclick="navigator.clipboard.writeText('${r.uuid}'); this.classList.add('copied'); setTimeout(() => this.classList.remove('copied'), 1000);">
        ${r.uuid}
      </div>
    </div>`
  })

  const cards = (await Promise.all(cardsPromises)).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EasyEDA Search: ${escapeHtml(query)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #f9f9f9;
      color: #333;
    }
    h1 { margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 20px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
    }
    .card {
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      transition: box-shadow 0.2s;
    }
    .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .card .images {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .card .image-box {
      flex: 1;
      min-width: 0;
    }
    .card .image-label {
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      text-align: center;
      margin-bottom: 4px;
    }
    .card img {
      width: 100%;
      height: 120px;
      object-fit: contain;
      border-radius: 4px;
      border: 1px solid #eee;
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 15px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card .meta {
      color: #666;
      font-size: 12px;
      line-height: 1.6;
    }
    .card .meta div { margin-bottom: 2px; }
    .card .uuid {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 10px;
      color: #888;
      background: #f5f5f5;
      padding: 6px 8px;
      border-radius: 4px;
      margin-top: 12px;
      cursor: pointer;
      word-break: break-all;
      transition: background 0.2s;
    }
    .card .uuid:hover { background: #e8e8e8; }
    .card .uuid.copied { background: #d4edda; color: #155724; }
    .instructions {
      background: #e8f4fd;
      border: 1px solid #b8daff;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .instructions code {
      background: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, monospace;
    }
  </style>
</head>
<body>
  <h1>EasyEDA Search: "${escapeHtml(query)}"</h1>
  <p class="subtitle">Found ${results.length} results. Click UUID to copy to clipboard.</p>

  <div class="instructions">
    <strong>How to use:</strong><br>
    1. Click on a UUID to copy it<br>
    2. Use <code>library_fetch</code> with the UUID to add to global JLC-MCP libraries<br>
    3. Or use <code>easyeda_fetch</code> for project-local EasyEDA library
  </div>

  <div class="grid">
    ${cards}
  </div>
</body>
</html>`

  // Write HTML file
  require('fs').writeFileSync(filepath, html, 'utf-8')

  // Open in default browser (cross-platform)
  const browserOpened = openInBrowser(filepath)

  return { filepath, browserOpened }
}

/**
 * Open a file in the default browser (cross-platform)
 * Returns true if browser was successfully opened, false otherwise
 */
function openInBrowser(filepath: string): boolean {
  const platform = process.platform

  try {
    switch (platform) {
      case 'darwin':
        // macOS
        execSync(`open "${filepath}"`, { stdio: 'ignore' })
        return true
      case 'win32':
        // Windows - use start command with empty title
        execSync(`start "" "${filepath}"`, { stdio: 'ignore', shell: 'cmd.exe' })
        return true
      case 'linux':
      default:
        // Linux and other Unix-like systems
        execSync(`xdg-open "${filepath}"`, { stdio: 'ignore' })
        return true
    }
  } catch {
    // If the platform-specific command fails, try alternatives
    const fallbacks = ['xdg-open', 'sensible-browser', 'x-www-browser', 'gnome-open']
    for (const cmd of fallbacks) {
      try {
        execSync(`${cmd} "${filepath}"`, { stdio: 'ignore' })
        return true
      } catch {
        // Try next fallback
      }
    }
    // All attempts failed
    return false
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generate SVG from EasyEDA footprint dataStr
 * Renders shapes with proper z-ordering: regions → tracks → pads → holes → text
 */
function generateFootprintSvg(dataStr: {
  shape?: string[]
  BBox?: { x: number; y: number; width: number; height: number }
  head?: { x?: number; y?: number }
}): string {
  if (!dataStr.shape || dataStr.shape.length === 0) {
    return ''
  }

  // Get bounding box or calculate from origin
  const bbox = dataStr.BBox || { x: 0, y: 0, width: 100, height: 100 }
  const padding = 5
  const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`

  // Separate shapes by type for proper z-ordering
  const regions: string[] = []
  const tracks: string[] = []
  const pads: string[] = []
  const holes: string[] = []
  const texts: string[] = []

  for (const shape of dataStr.shape) {
    if (typeof shape !== 'string') continue

    if (shape.startsWith('SOLIDREGION~')) {
      const svg = renderSolidRegion(shape)
      if (svg) regions.push(svg)
    } else if (shape.startsWith('TRACK~')) {
      const svg = renderTrackShape(shape)
      if (svg) tracks.push(svg)
    } else if (shape.startsWith('PAD~')) {
      const result = renderPadShape(shape)
      if (result) {
        pads.push(result.pad)
        if (result.hole) holes.push(result.hole)
      }
    } else if (shape.startsWith('TEXT~')) {
      const svg = renderTextShape(shape)
      if (svg) texts.push(svg)
    }
  }

  const allElements = [...regions, ...tracks, ...pads, ...holes, ...texts]
  if (allElements.length === 0) {
    return ''
  }

  // KiCAD-style colors: black bg, red pads, grey holes, yellow outlines/text
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" style="background:#000000">
  <style>
    .pad { fill: #CC0000; stroke: none; }
    .pad-hole { fill: #666666; }
    .track { fill: none; stroke: #FFFF00; stroke-linecap: round; stroke-linejoin: round; }
    .region { fill: #CC0000; opacity: 0.6; }
    .text-path { fill: none; stroke: #FFFF00; stroke-width: 0.4; stroke-linecap: round; stroke-linejoin: round; }
  </style>
  ${allElements.join('\n  ')}
</svg>`
}

/**
 * Render PAD shape to SVG - returns pad and hole separately for z-ordering
 * Format: PAD~shapeType~cx~cy~width~height~layer~~pinNum~holeDia~points~rot~id~...
 */
function renderPadShape(padData: string): { pad: string; hole: string | null } | null {
  const fields = padData.split('~')
  const shapeType = fields[1]
  const cx = parseFloat(fields[2]) || 0
  const cy = parseFloat(fields[3]) || 0

  if (shapeType === 'POLYGON') {
    // PAD~POLYGON~cx~cy~width~height~layer~~pinNum~holeDia~points...
    // Field indices: 0=PAD, 1=POLYGON, 2=cx, 3=cy, 4=width, 5=height, 6=layer, 7=empty, 8=pinNum, 9=holeDia, 10=points
    const holeDia = parseFloat(fields[9]) || 0
    const pointsStr = fields[10] || ''
    if (!pointsStr) return null

    // Parse polygon points (space-separated x y pairs)
    const coords = pointsStr.split(' ').map(Number)
    if (coords.length < 4) return null

    let pathD = `M ${coords[0]} ${coords[1]}`
    for (let i = 2; i < coords.length; i += 2) {
      pathD += ` L ${coords[i]} ${coords[i + 1]}`
    }
    pathD += ' Z'

    return {
      pad: `<path class="pad" d="${pathD}"/>`,
      hole: holeDia > 0 ? `<circle class="pad-hole" cx="${cx}" cy="${cy}" r="${holeDia}"/>` : null,
    }
  }

  // Standard pads: ELLIPSE, OVAL, RECT, ROUND
  const width = parseFloat(fields[4]) || 0
  const height = parseFloat(fields[5]) || 0
  const holeDia = parseFloat(fields[9]) || 0

  let padSvg = ''

  if (shapeType === 'ELLIPSE' || shapeType === 'OVAL' || shapeType === 'ROUND') {
    const rx = width / 2
    const ry = height / 2
    padSvg = `<ellipse class="pad" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`
  } else {
    // RECT or default
    const rectX = cx - width / 2
    const rectY = cy - height / 2
    padSvg = `<rect class="pad" x="${rectX}" y="${rectY}" width="${width}" height="${height}"/>`
  }

  return {
    pad: padSvg,
    hole: holeDia > 0 ? `<circle class="pad-hole" cx="${cx}" cy="${cy}" r="${holeDia}"/>` : null,
  }
}

/**
 * Render TRACK shape to SVG
 * Format: TRACK~width~layer~~points
 */
function renderTrackShape(trackData: string): string | null {
  const fields = trackData.split('~')
  const strokeWidth = parseFloat(fields[1]) || 0.5
  const pointsStr = fields[4] || ''

  if (!pointsStr) return null

  const coords = pointsStr.split(' ').map(Number)
  if (coords.length < 4) return null

  let pathD = `M ${coords[0]} ${coords[1]}`
  for (let i = 2; i < coords.length; i += 2) {
    pathD += ` L ${coords[i]} ${coords[i + 1]}`
  }

  return `<path class="track" d="${pathD}" stroke-width="${strokeWidth}"/>`
}

/**
 * Render SOLIDREGION shape to SVG
 * Format: SOLIDREGION~layer~~path~fill~id~...
 * Field indices: 0=SOLIDREGION, 1=layer, 2=empty, 3=path, 4=fill
 */
function renderSolidRegion(regionData: string): string | null {
  const fields = regionData.split('~')
  const pathD = fields[3] || ''

  if (!pathD || !pathD.startsWith('M')) return null

  return `<path class="region" d="${pathD}"/>`
}

/**
 * Render TEXT shape to SVG using pre-rendered path
 * Format: TEXT~align~x~y~strokeWidth~rot~?~layer~~fontSize~content~svgPath~id~~flag~type
 * Field indices: 7=layer, 10=content, 11=svgPath
 */
function renderTextShape(textData: string): string | null {
  const fields = textData.split('~')
  const svgPath = fields[11] || ''

  if (!svgPath || !svgPath.startsWith('M')) return null

  // Text is pre-rendered as SVG path commands - just use them directly
  return `<path class="text-path" d="${svgPath}"/>`
}

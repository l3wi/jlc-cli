/**
 * HTTP server for the EasyEDA Component Browser
 * Runs alongside the MCP stdio server to serve the web UI and proxy API requests
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { createLogger } from 'jlc-core'
import { handleRequest } from './routes.js'

const logger = createLogger('http-server')

const DEFAULT_PORT = 3847

let serverInstance: ReturnType<typeof createServer> | null = null

/**
 * Start the HTTP server
 * @returns The port the server is listening on
 */
export function startHttpServer(): number {
  if (serverInstance) {
    logger.debug('HTTP server already running')
    return DEFAULT_PORT
  }

  const port = parseInt(process.env.JLC_MCP_HTTP_PORT || String(DEFAULT_PORT), 10)

  serverInstance = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Add CORS headers to all responses
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      await handleRequest(req, res)
    } catch (error) {
      logger.error('Request error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })

  serverInstance.listen(port, () => {
    logger.info(`HTTP server listening on http://localhost:${port}`)
  })

  serverInstance.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.warn(`Port ${port} already in use, HTTP server not started`)
    } else {
      logger.error('HTTP server error:', error)
    }
  })

  return port
}

/**
 * Stop the HTTP server
 */
export function stopHttpServer(): void {
  if (serverInstance) {
    serverInstance.close()
    serverInstance = null
    logger.info('HTTP server stopped')
  }
}

/**
 * EasyEDA Community Library API client
 * For searching and fetching user-contributed components
 *
 * Uses shared parsers from common/parsers for all shape types.
 */

import type {
  EasyEDACommunitySearchParams,
  EasyEDACommunitySearchResult,
  EasyEDACommunityComponent,
} from '../types/index.js'
import { createLogger } from '../utils/index.js'
import {
  fetchWithCurlFallback,
  parseSymbolShapes,
  parseFootprintShapes,
} from '../parsers/index.js'

const logger = createLogger('easyeda-community-api')

const API_SEARCH_ENDPOINT = 'https://easyeda.com/api/components/search'
const API_COMPONENT_ENDPOINT = 'https://easyeda.com/api/components'
const API_VERSION = '6.5.51'

// Reuse 3D model endpoints from existing easyeda client
const ENDPOINT_3D_MODEL_STEP = 'https://modules.easyeda.com/qAxj6KHrDKw4blvCG8QJPs7Y/{uuid}'
const ENDPOINT_3D_MODEL_OBJ = 'https://modules.easyeda.com/3dmodel/{uuid}'

export class EasyEDACommunityClient {
  /**
   * Search the EasyEDA community library
   */
  async search(
    params: EasyEDACommunitySearchParams
  ): Promise<EasyEDACommunitySearchResult[]> {
    const formData = new URLSearchParams()
    formData.append('type', '3') // Component type
    formData.append('doctype[]', '2') // Symbol+footprint
    formData.append('uid', params.source || 'user')
    formData.append('returnListStyle', 'classifyarr')
    formData.append('wd', params.query)
    formData.append('version', API_VERSION)

    logger.debug(`Searching EasyEDA community: ${params.query}`)

    try {
      const responseText = (await fetchWithCurlFallback(API_SEARCH_ENDPOINT, {
        method: 'POST',
        body: formData.toString(),
        contentType: 'application/x-www-form-urlencoded',
      })) as string

      const data = JSON.parse(responseText)

      if (!data.success || !data.result) {
        logger.warn('EasyEDA search returned no results')
        return []
      }

      return this.parseSearchResults(data.result.lists, params.limit)
    } catch (error) {
      logger.error('EasyEDA search failed:', error)
      throw error
    }
  }

  /**
   * Get full component details by UUID
   */
  async getComponent(uuid: string): Promise<EasyEDACommunityComponent | null> {
    const url = `${API_COMPONENT_ENDPOINT}/${uuid}?version=${API_VERSION}&uuid=${uuid}`

    logger.debug(`Fetching component: ${uuid}`)

    try {
      const responseText = (await fetchWithCurlFallback(url)) as string
      const data = JSON.parse(responseText)

      if (!data.success || !data.result) {
        return null
      }

      return this.parseComponent(data.result)
    } catch (error) {
      logger.error(`Failed to fetch component ${uuid}:`, error)
      throw error
    }
  }

  /**
   * Download 3D model for a component
   */
  async get3DModel(
    uuid: string,
    format: 'step' | 'obj' = 'step'
  ): Promise<Buffer | null> {
    const url =
      format === 'step'
        ? ENDPOINT_3D_MODEL_STEP.replace('{uuid}', uuid)
        : ENDPOINT_3D_MODEL_OBJ.replace('{uuid}', uuid)

    try {
      const result = await fetchWithCurlFallback(url, { binary: true })
      return result as Buffer
    } catch {
      return null
    }
  }

  /**
   * Parse search results from the API response
   */
  private parseSearchResults(
    lists: Record<string, unknown[]>,
    limit?: number
  ): EasyEDACommunitySearchResult[] {
    const results: EasyEDACommunitySearchResult[] = []

    // Process all source lists (user, lcsc, easyeda, etc.)
    for (const [_source, items] of Object.entries(lists)) {
      if (!Array.isArray(items)) continue

      for (const item of items) {
        const result = this.parseSearchItem(item)
        if (result) {
          results.push(result)
        }

        if (limit && results.length >= limit) {
          return results
        }
      }
    }

    return results
  }

  /**
   * Parse a single search result item
   */
  private parseSearchItem(item: any): EasyEDACommunitySearchResult | null {
    try {
      const cPara = item.dataStr?.head?.c_para || {}
      const puuid = item.dataStr?.head?.puuid // Package/footprint UUID

      return {
        uuid: item.uuid || '',
        title: item.title || '',
        thumb: item.thumb || '',
        description: item.description || '',
        tags: item.tags || [],
        package: cPara.package || '',
        packageUuid: puuid || undefined,
        manufacturer: cPara.Manufacturer || cPara.BOM_Manufacturer || undefined,
        owner: {
          uuid: item.owner?.uuid || '',
          username: item.owner?.username || '',
          nickname: item.owner?.nickname || '',
          avatar: item.owner?.avatar,
          team: item.owner?.team,
        },
        contributor: cPara.Contributor,
        has3DModel: false, // Will be determined when fetching full component
        docType: item.docType || 2,
        updateTime: item.dataStr?.head?.utime,
      }
    } catch {
      return null
    }
  }

  /**
   * Parse full component data from the API response
   * Uses shared parsers for consistent shape parsing with LCSC client.
   */
  private parseComponent(result: any): EasyEDACommunityComponent {
    const dataStr = result.dataStr || {}
    const packageDetail = result.packageDetail || {}
    const cPara = dataStr.head?.c_para || {}

    // Parse symbol shapes using shared parser
    const symbolData = parseSymbolShapes(dataStr.shape || [])

    // Parse footprint shapes using shared parser
    const fpDataStr = packageDetail.dataStr || {}
    const fpCPara = fpDataStr.head?.c_para || {}
    const footprintData = parseFootprintShapes(fpDataStr.shape || [])

    // Get origins for coordinate normalization
    const symbolOrigin = {
      x: parseFloat(dataStr.head?.x) || 0,
      y: parseFloat(dataStr.head?.y) || 0,
    }
    const footprintOrigin = {
      x: parseFloat(fpDataStr.head?.x) || 0,
      y: parseFloat(fpDataStr.head?.y) || 0,
    }

    return {
      uuid: result.uuid || '',
      title: result.title || cPara.name || '',
      description: result.description || '',
      tags: result.tags || [],
      owner: {
        uuid: result.owner?.uuid || '',
        username: result.owner?.username || '',
        nickname: result.owner?.nickname || '',
        avatar: result.owner?.avatar,
        team: result.owner?.team,
      },
      creator: result.creator
        ? {
            uuid: result.creator.uuid || '',
            username: result.creator.username || '',
            nickname: result.creator.nickname || '',
            avatar: result.creator.avatar,
            team: result.creator.team,
          }
        : undefined,
      updateTime: result.updateTime || fpDataStr.head?.utime || 0,
      docType: result.docType || 2,
      verify: result.verify || false,
      symbol: {
        pins: symbolData.pins,
        rectangles: symbolData.rectangles,
        circles: symbolData.circles,
        ellipses: symbolData.ellipses,
        arcs: symbolData.arcs,
        polylines: symbolData.polylines,
        polygons: symbolData.polygons,
        paths: symbolData.paths,
        texts: symbolData.texts,
        origin: symbolOrigin,
        head: dataStr.head || {},
      },
      footprint: {
        uuid: packageDetail.uuid || '',
        name: fpCPara.package || packageDetail.title || 'Unknown',
        type: footprintData.type,
        pads: footprintData.pads,
        tracks: footprintData.tracks,
        holes: footprintData.holes,
        circles: footprintData.circles,
        arcs: footprintData.arcs,
        rects: footprintData.rects,
        texts: footprintData.texts,
        vias: footprintData.vias,
        solidRegions: footprintData.solidRegions,
        model3d: footprintData.model3d,
        origin: footprintOrigin,
        head: fpDataStr.head || {},
      },
      model3d: footprintData.model3d,
      rawData: result,
    }
  }
}

export const easyedaCommunityClient = new EasyEDACommunityClient()

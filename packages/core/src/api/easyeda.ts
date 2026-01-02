/**
 * EasyEDA API client for component library fetching
 *
 * Uses shared parsers from common/parsers for all shape types.
 */

import type { EasyEDAComponentData } from '../types/index.js';
import { createLogger } from '../utils/index.js';
import {
  fetchWithCurlFallback,
  parseSymbolShapes,
  parseFootprintShapes,
} from '../parsers/index.js';

const logger = createLogger('easyeda-api');

const API_ENDPOINT = 'https://easyeda.com/api/products/{lcsc_id}/components?version=6.4.19.5';
const ENDPOINT_3D_MODEL_STEP = 'https://modules.easyeda.com/qAxj6KHrDKw4blvCG8QJPs7Y/{uuid}';
const ENDPOINT_3D_MODEL_OBJ = 'https://modules.easyeda.com/3dmodel/{uuid}';

export class EasyEDAClient {
  private userAgent = 'ai-eda-lcsc-mcp/1.0.0';

  /**
   * Fetch component data from EasyEDA API
   */
  async getComponentData(lcscPartNumber: string): Promise<EasyEDAComponentData | null> {
    const url = API_ENDPOINT.replace('{lcsc_id}', lcscPartNumber);

    logger.debug(`Fetching component data for: ${lcscPartNumber}`);

    try {
      const responseText = await fetchWithCurlFallback(url) as string;
      const data = JSON.parse(responseText);

      if (!data.result) {
        return null;
      }

      return this.parseComponentData(data.result, lcscPartNumber);
    } catch (error) {
      logger.error(`Failed to fetch component ${lcscPartNumber}:`, error);
      throw error;
    }
  }

  /**
   * Download 3D model for a component
   */
  async get3DModel(uuid: string, format: 'step' | 'obj' = 'step'): Promise<Buffer | null> {
    const url = format === 'step'
      ? ENDPOINT_3D_MODEL_STEP.replace('{uuid}', uuid)
      : ENDPOINT_3D_MODEL_OBJ.replace('{uuid}', uuid);

    try {
      const result = await fetchWithCurlFallback(url, { binary: true });
      return result as Buffer;
    } catch {
      return null;
    }
  }

  /**
   * Parse raw EasyEDA API response into structured data
   */
  private parseComponentData(result: any, lcscId: string): EasyEDAComponentData {
    const dataStr = result.dataStr;
    const packageDetail = result.packageDetail;
    const lcscInfo = result.lcsc || {};
    const cPara = dataStr?.head?.c_para || {};

    // Parse symbol shapes using shared parser
    const symbolData = parseSymbolShapes(dataStr?.shape || []);

    // Parse footprint shapes using shared parser
    const fpDataStr = packageDetail?.dataStr;
    const fpCPara = fpDataStr?.head?.c_para || {};
    const footprintData = parseFootprintShapes(fpDataStr?.shape || []);

    // Get origins for coordinate normalization
    const symbolOrigin = {
      x: parseFloat(dataStr?.head?.x) || 0,
      y: parseFloat(dataStr?.head?.y) || 0,
    };
    const footprintOrigin = {
      x: parseFloat(fpDataStr?.head?.x) || 0,
      y: parseFloat(fpDataStr?.head?.y) || 0,
    };

    // Extract attributes from c_para (BOM_ prefixed fields)
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(cPara)) {
      if (key.startsWith('BOM_') && value && typeof value === 'string') {
        // Clean up key name: "BOM_Resistance" -> "Resistance"
        const cleanKey = key.replace(/^BOM_/, '');
        if (cleanKey !== 'Manufacturer' && cleanKey !== 'JLCPCB Part Class') {
          attributes[cleanKey] = value;
        }
      }
    }

    return {
      info: {
        name: cPara.name || lcscId,
        prefix: cPara.pre || 'U',
        package: cPara.package || fpCPara?.package,
        manufacturer: cPara.BOM_Manufacturer || cPara.Manufacturer,
        datasheet: lcscInfo.url,
        lcscId: lcscInfo.number || lcscId,
        jlcId: cPara['BOM_JLCPCB Part Class'],
        description: result.title || cPara.name,
        category: result.category || undefined,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        // CDFER parity fields
        stock: lcscInfo.stock,
        price: lcscInfo.price,
        minOrderQty: lcscInfo.min,
        process: result.SMT ? 'SMT' : 'THT',
        partClass: cPara['JLCPCB Part Class'],
        partNumber: cPara['Manufacturer Part'],
      },
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
      },
      footprint: {
        name: fpCPara?.package || 'Unknown',
        type: result.SMT && !packageDetail?.title?.includes('-TH_') ? 'smd' : 'tht',
        pads: footprintData.pads,
        tracks: footprintData.tracks,
        holes: footprintData.holes,
        circles: footprintData.circles,
        arcs: footprintData.arcs,
        rects: footprintData.rects,
        texts: footprintData.texts,
        vias: footprintData.vias,
        solidRegions: footprintData.solidRegions,
        origin: footprintOrigin,
      },
      model3d: footprintData.model3d,
      rawData: result,
    };
  }
}

export const easyedaClient = new EasyEDAClient();

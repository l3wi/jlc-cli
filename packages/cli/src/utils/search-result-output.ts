import type { ComponentSearchResult } from '@jlcpcb/core';

export function formatSearchResultForJson(result: ComponentSearchResult) {
  return {
    id: result.id,
    id_type: result.idType,
    lcsc_id: result.idType === 'lcsc' ? result.lcscId : undefined,
    easyeda_uuid: result.idType === 'easyeda_uuid' ? result.easyedaUuid ?? result.id : undefined,
    name: result.name,
    manufacturer: result.manufacturer,
    description: result.description,
    package: result.package,
    datasheet: result.datasheetPdf,
    stock: result.stock,
    price: result.price,
    library_type: result.libraryType,
    category: result.category,
    attributes: result.attributes,
  };
}

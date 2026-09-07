import { mock } from 'bun:test';
import * as core from '@jlcpcb/core';

const scenario = process.argv[2];
const manufacturing = scenario.startsWith('footprint-');
const symbolScenario = scenario === 'disabled-footprint' || scenario.startsWith('symbol-');
const symbolReference = `<svg>
  <g c_partid="part_pin" c_spicepin="1" c_origin="-10,0" c_elec="1" ${scenario === 'symbol-unverified' ? '' : 'c_rotation="180"'}>
    ${scenario === 'symbol-unverified' ? '' : '<path d="M-10,0h5"/>'}<text>IN</text><text>1</text>
  </g>
  <g c_partid="part_pin" c_spicepin="2" c_origin="10,0" c_elec="2" c_rotation="0">
    <path d="M10,0h-5"/><text>OUT</text><text>2</text>
  </g>
</svg>`;
const reference = manufacturing
  ? {
    footprintSvg: `<svg><g c_partid="part_pad" number="1" c_origin="0,0" ${scenario === 'footprint-unverified' ? '' : 'layerid="1"'}>
      <rect x="-2" y="-1" width="4" height="2" />
      <circle c_padhole="1" cx="0" cy="0" r="0" />
    </g></svg>`,
    symbolSvg: null,
  }
  : symbolScenario
    ? { footprintSvg: null, symbolSvg: symbolReference }
    : { footprintSvg: null, symbolSvg: null };

mock.module('@jlcpcb/core', () => ({
  ...core,
  fetchReferenceSVG: async () => reference,
  easyedaClient: { getComponentData: async () => ({
    info: { name: scenario === 'footprint-identity-mpn' ? 'DifferentPart' : 'Part' },
    footprint: { name: scenario === 'footprint-identity-package' ? 'DifferentPackage' : 'PKG' },
  }) },
  footprintConverter: {
    convert: () => `(footprint "Part" (pad "1" smd rect (at ${scenario === 'footprint-moved' ? 4 : 0} 0) (size 1.016 0.508) (layers "F.Cu")))`,
  },
  symbolConverter: {
    convert: () => `(symbol "Part" (symbol "Part_1_1"
      (pin input line (at -2.54 0 0) (length 1.27) (name "IN") (number "1"))
      (pin output line (at ${scenario === 'symbol-moved' ? 4.54 : 2.54} 0 180) (length 1.27) (name "OUT") (number "2"))))`,
  },
  getAllTestComponents: () => [{ lcsc: 'C123', name: 'Part', expectedMpn: 'Part', expectedPackage: 'PKG' }],
  createLibraryService: () => ({
    listInstalled: async () => [{ lcscId: 'C123', name: 'Part' }],
    regenerate: async () => ({
      total: 1,
      success: 0,
      failed: 1,
      components: [{ id: 'C123', name: 'Part', status: 'failed', error: 'conversion failed' }],
    }),
  }),
}));

// Commands must load after the subprocess-specific dependency mocks.
if (scenario === 'regenerate') {
  const { regenerateCommand } = await import('../library.js');
  await regenerateCommand({});
} else {
  const { validateCommand } = await import('../validate.js');
  const batch = scenario === 'batch-missing' || scenario.startsWith('footprint-identity-');
  await validateCommand(batch ? undefined : 'C123', {
    json: scenario !== 'text-missing',
    all: batch,
    symbolOnly: symbolScenario,
    footprintOnly: manufacturing,
  });
}

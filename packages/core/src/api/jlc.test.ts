import { describe, expect, it, spyOn } from 'bun:test';

import { buildSearchRequestBody, jlcClient, mapPcbaType } from './jlc.js';

describe('mapPcbaType', () => {
  // Values verified against JLCPCB part pages: C25804 -> 0, C25054/C5280015 -> 2
  it('maps JLCPCB componentProductType to PCBA service compatibility', () => {
    expect(mapPcbaType(0)).toBe('economic-and-standard');
    expect(mapPcbaType(2)).toBe('standard-only');
  });

  it('leaves unknown or missing values undefined instead of assuming a service', () => {
    expect(mapPcbaType(1)).toBeUndefined();
    expect(mapPcbaType(undefined)).toBeUndefined();
  });
});

describe('buildSearchRequestBody', () => {
  it('sends the verified base body', () => {
    expect(buildSearchRequestBody('LDO', {})).toEqual({
      currentPage: 1,
      pageSize: 10,
      keyword: 'LDO',
      searchType: 2,
    });
  });

  it('sends catalogue filters under the names the API accepts', () => {
    const body = buildSearchRequestBody('', {
      limit: 5,
      page: 3,
      typeIds: [2956],
      brands: ['3PEAK'],
      packages: ['SOT-23'],
      // values OR inside an attribute; separate groups AND
      attributeFilters: [{ 'Output Current': ['1A', '1.5A'] }, { 'Output Type': ['Adjustable'] }],
    });

    expect(body).toMatchObject({
      currentPage: 3,
      pageSize: 5,
      keyword: '',
      componentTypeIdList: [2956],
      componentBrandList: ['3PEAK'],
      componentSpecificationList: ['SOT-23'],
      componentAttributeList: [{ 'Output Current': ['1A', '1.5A'] }, { 'Output Type': ['Adjustable'] }],
    });
  });

  it('omits empty filter lists and maps the assembly filters', () => {
    const body = buildSearchRequestBody('cap', {
      inStock: true,
      basicOnly: true,
      typeIds: [],
      brands: [],
      attributeFilters: [],
      economicOnly: true,
    });

    expect(body).toEqual({
      currentPage: 1,
      pageSize: 50, // economicOnly over-fetches one page, then filters locally
      keyword: 'cap',
      searchType: 2,
      presaleType: 'stock',
      componentLibTypes: ['base'],
      preferredComponentFlag: true,
    });
  });
});

/** Stub the global fetch and record the request bodies the client sends */
function stubFetch(payload: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const spy = spyOn(globalThis, 'fetch').mockImplementation((async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch);
  return { calls, restore: () => spy.mockRestore() };
}

describe('getComponentTypes', () => {
  it('flattens the two-level catalogue and keeps the numeric ids', async () => {
    const { calls, restore } = stubFetch({
      code: 200,
      message: null,
      data: {
        sortAndCountVoList: [
          {
            sortUuid: 'uuid-pmic',
            sortName: 'Power Management (PMIC)',
            componentSortKeyId: 9,
            parentId: 0,
            grade: 1,
            componentCount: 183787,
            childSortList: [
              {
                sortName: 'Voltage Regulators - Linear, Low Drop Out (LDO) Regulators',
                componentSortKeyId: 2956,
                parentId: 9,
                grade: 2,
                componentCount: 63730,
                childSortList: null,
              },
            ],
          },
        ],
      },
    });

    try {
      const types = await jlcClient.getComponentTypes();

      expect(types).toEqual([
        {
          id: 9,
          name: 'Power Management (PMIC)',
          parentId: 0,
          parentName: undefined,
          grade: 1,
          componentCount: 183787,
        },
        {
          id: 2956,
          name: 'Voltage Regulators - Linear, Low Drop Out (LDO) Regulators',
          parentId: 9,
          parentName: 'Power Management (PMIC)',
          grade: 2,
          componentCount: 63730,
        },
      ]);
      // searchType 1 is what makes the API return the catalogue instead of rows
      expect(calls).toEqual([
        {
          url: expect.stringContaining('/selectSmtComponentList/v2'),
          body: { currentPage: 1, pageSize: 1, searchType: 1 },
        },
      ]);
    } finally {
      restore();
    }
  });
});

describe('getFilterAttributes', () => {
  const facetPayload = {
    code: 200,
    message: null,
    data: {
      total: 63730,
      basePart: 0,
      preferredPart: 3,
      economicPart: 63395,
      standardPart: 63730,
      extendPart: 63730,
      dataSheetPart: 56630,
      paramList: [
        { key: 'Output Current', name: 'Output Current', docCount: 58111, subAggs: [{ key: '1A', docCount: 5125 }] },
        { key: 'Output Type', name: 'Output Type', docCount: 63730, subAggs: [{ key: 'Fixed', docCount: 53147 }] },
      ],
      paramRangeList: [
        {
          key: 'Output Current',
          name: 'Output Current',
          docCount: 58111,
          rangeFlag: true,
          unitConversionMap: { mA: 0.001, A: 1 },
          unitList: ['mA', 'A'],
          subAggs: [{ key: '1A', docCount: 5125 }],
        },
      ],
      componentBrandList: [{ key: '3PEAK', docCount: 174 }],
      componentSpecificationList: [{ key: 'SOT-23', docCount: 1161 }],
      presaleTypeAggs: [{ key: 'stock', docCount: 15555 }],
    },
  };

  it('merges enum and range vocabularies and exposes counts, brands and packages', async () => {
    const { calls, restore } = stubFetch(facetPayload);

    try {
      const facets = await jlcClient.getFilterAttributes([2956], { brands: ['3PEAK'] });

      expect(facets.typeIds).toEqual([2956]);
      expect(facets.total).toBe(63730);
      expect(facets.counts).toEqual({
        base: 0,
        preferred: 3,
        economic: 63395,
        standard: 63730,
        extended: 63730,
        datasheet: 56630,
      });

      // one entry per attribute name: the range side wins and carries units plus parsed numbers
      const current = facets.attributes.find((a) => a.name === 'Output Current');
      expect(current).toMatchObject({ kind: 'range', unit: 'A', docCount: 58111 });
      expect(current?.values).toEqual([{ value: '1A', docCount: 5125, numbers: [1] }]);
      expect(facets.attributes.find((a) => a.name === 'Output Type')).toEqual({
        name: 'Output Type',
        docCount: 63730,
        kind: 'enum',
        unit: undefined,
        unitConversionMap: undefined,
        unitList: undefined,
        values: [{ value: 'Fixed', docCount: 53147, numbers: undefined }],
      });
      expect(facets.attributes.filter((a) => a.name === 'Output Current')).toHaveLength(1);

      expect(facets.brands).toEqual([{ value: '3PEAK', docCount: 174, numbers: undefined }]);
      expect(facets.packages).toEqual([{ value: 'SOT-23', docCount: 1161, numbers: undefined }]);
      expect(facets.presaleTypes).toEqual([{ value: 'stock', docCount: 15555, numbers: undefined }]);

      expect(calls).toEqual([
        {
          url: expect.stringContaining('/componentSearch/filterComponentAttribute'),
          body: { baseQueryDto: { componentTypeIdList: [2956], componentBrandList: ['3PEAK'] } },
        },
      ]);
    } finally {
      restore();
    }
  });

  it('surfaces the API business error instead of an empty vocabulary', async () => {
    const { restore } = stubFetch({ code: 101, message: '系统发生未知错误，请稍后重试.', data: null });

    try {
      await expect(jlcClient.getFilterAttributes([2956])).rejects.toThrow(/code 101/);
    } finally {
      restore();
    }
  });
});

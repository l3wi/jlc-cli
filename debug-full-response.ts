// Dump the full EasyEDA API response to find any hole data we might be missing

async function debug() {
  const uuid = 'c3c77f2e66fb4085aa0571e9b224d7d4';

  const response = await fetch(`https://easyeda.com/api/components/${uuid}`);
  const data = await response.json();

  const pkgDetail = data.result?.packageDetail;
  if (!pkgDetail) {
    console.log('No packageDetail');
    return;
  }

  const dataStr = pkgDetail.dataStr;

  // Check all top-level keys in dataStr
  console.log('=== dataStr keys ===');
  console.log(Object.keys(dataStr));

  // Check if there's a holes/drill related key
  for (const key of Object.keys(dataStr)) {
    const value = dataStr[key];
    const str = JSON.stringify(value);
    if (str.toLowerCase().includes('hole') || str.toLowerCase().includes('drill')) {
      console.log(`\n=== ${key} contains hole/drill ===`);
      console.log(typeof value === 'string' ? value.slice(0, 500) : JSON.stringify(value, null, 2).slice(0, 500));
    }
  }

  // Check the 'objects' field specifically
  if (dataStr.objects) {
    console.log('\n=== objects field ===');
    console.log(JSON.stringify(dataStr.objects, null, 2).slice(0, 1000));
  }

  // Check the 'head' field
  if (dataStr.head) {
    console.log('\n=== head field ===');
    console.log(JSON.stringify(dataStr.head, null, 2).slice(0, 1000));
  }

  // Look at all shape types more carefully
  const shapes = dataStr.shape || [];
  console.log('\n=== All shape types ===');
  const types = new Map<string, string[]>();
  for (const shape of shapes) {
    const type = shape.split('~')[0];
    if (!types.has(type)) types.set(type, []);
    types.get(type)!.push(shape);
  }

  for (const [type, items] of types) {
    console.log(`\n${type} (${items.length}):`);
    // Show first item truncated
    console.log('  First:', items[0].slice(0, 150) + '...');
  }

  // Check if there's any reference to holes in PAD data that we might parse differently
  console.log('\n=== Full first PAD ===');
  const firstPad = shapes.find((s: string) => s.startsWith('PAD~'));
  if (firstPad) {
    console.log(firstPad);
  }
}

debug().catch(console.error);

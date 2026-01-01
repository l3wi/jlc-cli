import { easyedaCommunityClient } from './src/api/easyeda-community.ts';

async function debug() {
  const uuid = 'c3c77f2e66fb4085aa0571e9b224d7d4';
  const comp = await easyedaCommunityClient.getComponent(uuid);

  // Check what tracks look like
  console.log('=== TRACKS (first 3) ===');
  for (const t of comp.footprint.tracks.slice(0, 3)) {
    console.log(JSON.stringify(t, null, 2));
  }

  // Check arcs, circles, rects for silkscreen
  console.log('\n=== ARCS ===');
  console.log(comp.footprint.arcs.slice(0, 2));

  console.log('\n=== CIRCLES ===');
  console.log(comp.footprint.circles.slice(0, 2));

  console.log('\n=== RECTS ===');
  console.log(comp.footprint.rects.slice(0, 2));
}

debug().catch(console.error);

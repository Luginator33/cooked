/**
 * Seed script: Populates the unified `restaurants` Supabase table
 * from static restaurants.js + community_restaurants + admin_overrides
 *
 * Run: node scripts/seed-restaurants.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read env
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Map JS field names to DB column names
function jsToDb(r) {
  return {
    id: Number(r.id),
    name: r.name || null,
    city: r.city || null,
    neighborhood: r.neighborhood || null,
    cuisine: r.cuisine || null,
    price: r.price || null,
    rating: r.rating ? Number(r.rating) : null,
    lat: r.lat ? Number(r.lat) : null,
    lng: r.lng ? Number(r.lng) : null,
    address: r.address || null,
    phone: r.phone || null,
    website: r.website || null,
    hours: Array.isArray(r.hours) ? r.hours : null,
    tags: Array.isArray(r.tags) ? r.tags : null,
    img: r.img || null,
    img2: r.img2 || null,
    description: r.desc || r.description || null,
    about: r.about || null,
    must_order: Array.isArray(r.must_order) ? r.must_order : null,
    vibe: r.vibe || null,
    best_for: Array.isArray(r.best_for) ? r.best_for : (typeof r.best_for === 'string' ? [r.best_for] : null),
    known_for: r.known_for || null,
    insider_tip: r.insider_tip || null,
    price_detail: r.price_detail || null,
    source: r.source || null,
    place_id: r.placeId || r.place_id || null,
    google_maps_url: r.googleMapsUrl || r.google_maps_url || null,
    google_rating: r.googleRating || r.google_rating ? Number(r.googleRating || r.google_rating) : null,
    google_reviews: r.googleReviews || r.google_reviews ? Number(r.googleReviews || r.google_reviews) : null,
    heat: r.heat || null,
    is_bar: r.isBar === true || r.is_bar === true,
    is_hotel: r.isHotel === true || r.is_hotel === true,
    is_deleted: false,
    merged_into_id: null,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  console.log('=== Cooked Restaurant Migration ===\n');

  // Step 1: Load static restaurants from the JS file
  // We need to eval the file since it uses export syntax
  const jsContent = readFileSync(join(__dirname, '..', 'src', 'data', 'restaurants.js'), 'utf8');

  // Extract RESTAURANTS_RAW array
  const rawMatch = jsContent.match(/const RESTAURANTS_RAW = \[([\s\S]*?)\];\s*$/m);
  if (!rawMatch) {
    // Try to find just the array start and parse until the matching ]
    console.log('Parsing restaurants from file...');
  }

  // Use dynamic import since it's an ESM module
  let RESTAURANTS_RAW;
  try {
    const mod = await import(join(__dirname, '..', 'src', 'data', 'restaurants.js'));
    RESTAURANTS_RAW = mod.RESTAURANTS || [];
    console.log(`Loaded ${RESTAURANTS_RAW.length} static restaurants`);
  } catch (e) {
    console.error('Failed to import restaurants.js:', e.message);
    console.log('Trying alternative parse...');

    // Fallback: read and eval
    const dataStart = jsContent.indexOf('const RESTAURANTS_RAW = [');
    if (dataStart === -1) { console.error('Cannot find RESTAURANTS_RAW'); process.exit(1); }
    const arrStart = jsContent.indexOf('[', dataStart);
    let depth = 0, end = arrStart;
    for (let i = arrStart; i < jsContent.length; i++) {
      if (jsContent[i] === '[') depth++;
      if (jsContent[i] === ']') depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    const arrStr = jsContent.slice(arrStart, end);
    RESTAURANTS_RAW = eval(arrStr);
    console.log(`Parsed ${RESTAURANTS_RAW.length} static restaurants`);
  }

  // Step 2: Fetch community restaurants from Supabase
  console.log('Fetching community restaurants...');
  let community = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('community_restaurants').select('*').range(from, from + 999);
    if (error) { console.error('Community fetch error:', error); break; }
    if (!data || data.length === 0) break;
    community.push(...data);
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`Fetched ${community.length} community restaurants`);

  // Step 3: Fetch admin overrides
  console.log('Fetching admin overrides...');
  const { data: overrides } = await supabase.from('admin_overrides').select('*');
  console.log(`Fetched ${(overrides || []).length} admin overrides`);

  // Step 4: Build the unified map
  const byId = new Map();
  const byName = new Map();

  // Add static restaurants
  for (const r of RESTAURANTS_RAW) {
    const db = jsToDb(r);
    if (!db.name) continue;
    db.source = db.source || 'static';
    byId.set(db.id, db);
    byName.set(db.name.toLowerCase().trim(), db);
  }
  console.log(`Static: ${byId.size} unique restaurants`);

  // Merge community restaurants (may override static by name)
  for (const r of community) {
    const db = jsToDb(r);
    if (!db.name) continue;
    db.source = db.source || 'community';
    const nameKey = db.name.toLowerCase().trim();

    // Dedup by name — if same name exists with different ID, use the community version
    const existingByName = byName.get(nameKey);
    if (existingByName && existingByName.id !== db.id) {
      byId.delete(existingByName.id);
    }

    // Merge: community data overwrites static
    const existing = byId.get(db.id) || {};
    byId.set(db.id, { ...existing, ...db });
    byName.set(nameKey, byId.get(db.id));
  }
  console.log(`After community merge: ${byId.size} restaurants`);

  // Apply admin overrides
  for (const o of (overrides || [])) {
    const id = Number(o.restaurant_id);
    if (o.action === 'delete' || o.action === 'merge_into') {
      const existing = byId.get(id);
      if (existing) {
        existing.is_deleted = true;
        if (o.action === 'merge_into' && o.merged_into_id) {
          existing.merged_into_id = Number(o.merged_into_id);
        }
      }
    }
    if (o.action === 'edit' && o.override_data) {
      const existing = byId.get(id);
      if (existing) {
        // Apply edit fields
        const edit = o.override_data;
        if (edit.name) existing.name = edit.name;
        if (edit.city) existing.city = edit.city;
        if (edit.neighborhood) existing.neighborhood = edit.neighborhood;
        if (edit.cuisine) existing.cuisine = edit.cuisine;
        if (edit.price) existing.price = edit.price;
        if (edit.description) existing.description = edit.description;
        if (edit.desc) existing.description = edit.desc;
        if (edit.rating != null) existing.rating = Number(edit.rating);
        if (edit.lat != null) existing.lat = Number(edit.lat);
        if (edit.lng != null) existing.lng = Number(edit.lng);
        if (edit.tags) existing.tags = Array.isArray(edit.tags) ? edit.tags : edit.tags.split(',').map(t => t.trim());
        if (edit.website) existing.website = edit.website;
        if (edit.phone) existing.phone = edit.phone;
        if (edit.address) existing.address = edit.address;
        existing.updated_at = o.updated_at || new Date().toISOString();
      }
    }
  }

  // Step 5: Upsert into unified table in batches of 500
  const all = Array.from(byId.values());
  console.log(`\nTotal restaurants to upsert: ${all.length}`);
  console.log(`  - Active: ${all.filter(r => !r.is_deleted).length}`);
  console.log(`  - Soft-deleted: ${all.filter(r => r.is_deleted).length}`);

  const BATCH_SIZE = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('restaurants').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} error:`, error.message);
      errors++;
      // Try one by one for this batch
      for (const r of batch) {
        const { error: singleErr } = await supabase.from('restaurants').upsert(r, { onConflict: 'id' });
        if (singleErr) {
          console.error(`  Failed: ${r.id} ${r.name}: ${singleErr.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
      process.stdout.write(`  Upserted ${inserted}/${all.length}\r`);
    }
  }

  console.log(`\n\n=== Migration Complete ===`);
  console.log(`Inserted/updated: ${inserted}`);
  console.log(`Batch errors: ${errors}`);

  // Verify
  const { count } = await supabase.from('restaurants').select('id', { count: 'exact', head: true });
  console.log(`Total rows in restaurants table: ${count}`);
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });

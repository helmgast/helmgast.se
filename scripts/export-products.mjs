#!/usr/bin/env node
/**
 * Exports products from MongoDB → src/content/products/<slug>/<slug>.yaml
 *
 * Usage:
 *   MONGO_URI="mongodb://localhost:27099/fablr3" node scripts/export-products.mjs
 *
 * Requires: npm install mongodb js-yaml
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGO_URI = process.env.MONGO_URI
  || 'mongodb://admin:6mdG9cFb5YvJFZTa@localhost:27018/fablr3?authSource=admin';
const DB_NAME = 'fablr3';
const OUT_DIR = path.join(__dirname, '..', 'src', 'content', 'products');

const yaml = (await import('js-yaml')).default;
function toYaml(obj) {
  return yaml.dump(obj, { lineWidth: 120, noRefs: true, sortKeys: false });
}

// Language by product number prefix (lowercase)
const PREFIX_LANG = {
  ea: 'sv',
  eon: 'sv',
  fe: 'sv',
  ht: 'sv',
  kdl: 'en',
  kfg: 'sv',
  kh: 'sv',
  neo: 'sv',
  nr: 'sv',
  tbs: 'en',
};

function langForProduct(productNumber, titleI18n) {
  if (productNumber) {
    const prefix = productNumber.toLowerCase().match(/^([a-z]+)/)?.[1];
    if (prefix && PREFIX_LANG[prefix]) return PREFIX_LANG[prefix];
  }
  // Fallback: first key in title_i18n
  const keys = Object.keys(titleI18n || {});
  return keys[0] || 'sv';
}

// Pick the best string from an i18n map given a language
function pick(map, lang) {
  if (!map || typeof map !== 'object') return map ?? null;
  return map[lang] || map['sv'] || map['en'] || Object.values(map).find(v => v) || null;
}

// FileAsset → URL
function assetUrl(asset) {
  if (!asset) return null;
  if (asset.source_file_url) return asset.source_file_url;
  return `https://helmgast.se/asset/download/${asset.slug}`;
}

// Format a date to YYYY-MM-DD string
function fmtDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Connecting to ${MONGO_URI.replace(/:([^@]+)@/, ':***@')}...`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const [products, fileAssets, worlds, publishers] = await Promise.all([
    db.collection('product').find({}).toArray(),
    db.collection('file_asset').find({}).toArray(),
    db.collection('world').find({}).toArray(),
    db.collection('publisher').find({}).toArray(),
  ]);

  const assetById = Object.fromEntries(fileAssets.map(a => [a._id.toString(), a]));
  const worldById = Object.fromEntries(worlds.map(w => [w._id.toString(), w]));
  const publisherById = Object.fromEntries(publishers.map(p => [p._id.toString(), p]));

  console.log(`Found ${products.length} products, ${fileAssets.length} file assets\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let exported = 0, skipped = 0;

  for (const p of products) {
    const slug = p.slug;
    if (!slug) { console.warn(`  ⚠ No slug for ${p._id}, skipping`); skipped++; continue; }

    const world = p.world ? worldById[p.world.toString()] : null;
    const publisher = p.publisher ? publisherById[p.publisher.toString()] : null;

    // Merge flat fields with i18n maps (flat fields are legacy, i18n takes priority if non-empty)
    const titleI18n = (p.title_i18n && Object.values(p.title_i18n).some(v => v))
      ? p.title_i18n : (p.title ? { sv: p.title } : {});
    const descI18n = (p.description_i18n && Object.values(p.description_i18n).some(v => v))
      ? p.description_i18n : (p.description ? { sv: p.description } : {});

    const lang = langForProduct(p.product_number, titleI18n);

    const title = pick(titleI18n, lang) || slug;
    const description = pick(descI18n, lang) || null;
    const shopUrl = pick(p.shop_url_i18n, lang) || null;

    // Images
    const imageAssets = (p.images || []).map(r => assetById[r.toString()]).filter(Boolean);
    const featureAsset = p.feature_image ? assetById[p.feature_image.toString()] : null;
    const [coverAsset, ...showcaseAssets] = imageAssets;
    const effectiveCover = coverAsset || featureAsset;

    // Prices
    const prices = [];
    if (p.prices?.length) {
      for (const pr of p.prices) prices.push({ currency: pr.currency, price: pr.price });
    } else if (p.price > 0) {
      prices.push({ currency: p.currency || 'sek', price: p.price });
    }

    // Downloads
    const downloadAssets = (p.downloads || []).map(r => assetById[r.toString()]).filter(Boolean);

    // Build record — all strings, no i18n maps
    const record = {};

    if (p.product_number) record.product_number = p.product_number;
    if (p.project_code)   record.project_code = p.project_code;
    if (p.barcode)        record.barcode = String(p.barcode);
    if (p.ean)            record.barcode = String(p.ean);

    record.title = title;
    if (description)      record.description = description;

    record.language = lang;
    if (world)            record.world = world.slug;
    if (publisher)        record.publisher = publisher.slug;
    if (p.family)         record.family = p.family;
    record.type   = p.type   || 'book';
    record.status = p.status || 'available';

    // Dates
    if (p.publish_date)   record.publish_date = p.publish_date;
    if (p.created)        record.created_date = fmtDate(p.created);
    if (p.updated)        record.updated_date = fmtDate(p.updated);

    if (prices.length)    record.prices = prices;
    if (p.tax != null && p.tax !== 0.25) record.tax = p.tax;
    if (shopUrl)          record.shop_url = shopUrl;

    if (effectiveCover)   record.cover_image = assetUrl(effectiveCover);
    if (showcaseAssets.length) {
      record.images = showcaseAssets.map(a => assetUrl(a)).filter(Boolean);
    }

    if (downloadAssets.length) {
      record.downloads = downloadAssets.map(a => ({
        label: a.title || a.source_filename || a.slug,
        url: assetUrl(a),
        ...(a.description ? { description: a.description } : {}),
      }));
    }

    if (p.acknowledgement) record.acknowledgement = p.acknowledgement;
    if (p.tags?.length)    record.tags = p.tags;

    const dir = path.join(OUT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${slug}.yaml`), toYaml(record));
    console.log(`  ✓ ${slug} (${lang}, ${downloadAssets.length} dl, ${imageAssets.length} img)`);
    exported++;
  }

  await client.close();
  console.log(`\n=== Summary ===`);
  console.log(`Exported: ${exported}, Skipped: ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });

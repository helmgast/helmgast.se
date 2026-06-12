// 1. Import utilities from `astro:content`
import { z, defineCollection } from 'astro:content';
import { worldSlugs } from 'src/utils/helpers';

// 2. Define a `type` and `schema` for each collection
const articles = defineCollection({
  type: 'content', // v2.5.0 and later
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).optional(),
    type: z.enum(['default', 'blogpost', 'material', 'person', 'place', 'character',]),
    status: z.enum(['draft', 'published', 'private']),
    creator: z.string(),
    world: z.enum(["eon", "kult", "jarn", "ereb-altor", "hjaltarnas-tid", "kopparhavets-hjaltar", "neotech", "noir", "the-troubleshooters", "meta"]).optional(),
    license: z.string().optional(),
    language: z.enum(['sv', 'en', 'fr']),
    created_date: z.string().transform((str) => new Date(str)),
    theme: z.string().optional(),
    images: z.array(z.string()).optional(),
  }),
});

const worlds = defineCollection({
    type: 'content', // v2.5.0 and later
    schema: z.object({
      title: z.string(),
      tagline: z.string().optional(),
      tags: z.array(z.string()).optional(),
      rule_system: z.string().optional(),
      status: z.enum(['draft', 'published', 'private']),
      creator: z.string().optional(),
      product_url: z.string().optional(),
      facebook_url: z.string().optional(),
      publishing_year: z.string(),
      external_host: z.string().optional(),
      languages: z.array(z.enum(['sv', 'en', 'fr', 'de'])).optional(),
      created_date: z.string().transform((str) => new Date(str)),
      theme: z.string().optional(),
      landscape_image: z.string().optional(),
      portrait_image: z.string().optional(),
    }),
  });

const products = defineCollection({
  type: 'data',
  schema: z.object({
    // Identifiers
    product_number: z.string().optional(), // e.g. "NEO-EDGE-001" — used as product code
    project_code: z.string().optional(),  // e.g. "NEO"
    barcode: z.string().optional(),       // EAN-13 or similar

    // Content
    title: z.string(),
    description: z.string().optional(),
    language: z.enum(['sv', 'en', 'fr', 'de']),
    world: z.string().optional(),
    publisher: z.string().optional(),
    family: z.string().optional(),

    // Classification
    type: z.enum(['book', 'item', 'digital', 'shipping']),
    status: z.enum(['pre_order', 'available', 'ready_for_download', 'out_of_stock', 'hidden']),
    publish_date: z.string().optional(),
    created_date: z.string().optional(),
    updated_date: z.string().optional(),

    // Pricing
    prices: z.array(z.object({
      currency: z.enum(['sek', 'eur', 'usd']),
      price: z.number(),
    })).optional(),
    tax: z.number().optional(),

    // Shop link
    shop_url: z.string().optional(),

    // Images (local paths relative to product folder, or URLs)
    cover_image: z.string().optional(),
    images: z.array(z.string()).optional(),

    // Downloadable files
    downloads: z.array(z.object({
      label: z.string(),
      url: z.string(),
      description: z.string().optional(),
    })).optional(),

    // Misc
    acknowledgement: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { articles, worlds, products };
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

export const collections = { articles, worlds };
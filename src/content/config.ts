// 1. Import utilities from `astro:content`
import { z, defineCollection } from 'astro:content';

// 2. Define a `type` and `schema` for each collection
const articles = defineCollection({
  type: 'content', // v2.5.0 and later
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).optional(),
    type: z.enum(['default', 'blogpost', 'material', 'person', 'place', 'character',]),
    status: z.enum(['draft', 'published', 'private']),
    creator: z.string(),
    world: z.string().optional(),
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
      language: z.enum(['sv', 'en', 'fr']).optional(),
      created_date: z.string().transform((str) => new Date(str)),
      theme: z.string().optional(),
      images: z.array(z.string()).optional(),
    }),
  });

export const collections = { articles, worlds };
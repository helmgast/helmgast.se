import { getCollection } from 'astro:content';

export async function GET() {
  const products = await getCollection('products', ({ data }) => data.status !== 'hidden');

  const payload = products.map(p => ({
    slug: p.id.split('/')[0],
    title: p.data.title,
    description: p.data.description ?? null,
    type: p.data.type,
    status: p.data.status,
    world: p.data.world ?? null,
    family: p.data.family ?? null,
    language: p.data.language,
    product_number: p.data.product_number ?? null,
    publish_date: p.data.publish_date ?? null,
    created_date: p.data.created_date ?? null,
    cover_image: p.data.cover_image ?? null,
    shop_url: p.data.shop_url ?? null,
    prices: p.data.prices ?? null,
    downloads: p.data.downloads ?? null,
  }));

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
}

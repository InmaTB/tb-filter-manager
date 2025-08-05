import dotenv from 'dotenv';
dotenv.config();

const SHOPIFY_STOREFRONT_API_URL = process.env.SHOPIFY_STOREFRONT_API_URL;
const SHOPIFY_STOREFRONT_API_TOKEN = process.env.SHOPIFY_STOREFRONT_API_TOKEN;

if (!SHOPIFY_STOREFRONT_API_URL || !SHOPIFY_STOREFRONT_API_TOKEN) {
  throw new Error('Faltan variables de entorno para la Storefront API');
}

export async function storefrontQuery({ query, variables = {} }) {
  const res = await fetch(SHOPIFY_STOREFRONT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_API_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  const result = await res.json();

  if (!res.ok) {
    console.error('❌ HTTP error:', res.status);
    console.error('❌ Response text:', JSON.stringify(result, null, 2));
    throw new Error(`HTTP error ${res.status}`);
  }

  if (result.errors) {
    console.error('❌ GraphQL error(s):');
    for (const err of result.errors) {
      console.error(`  - ${err.message || '(sin mensaje)'}`);
      if (err.extensions) {
        console.error('    → extensions:', err.extensions);
      }
    }
    throw new Error('Error en Storefront API');
  }

  return result.data;
}

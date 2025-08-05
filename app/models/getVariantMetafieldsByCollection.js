// models/getVariantMetafieldsByCollection.js
import { request } from 'graphql-request';
import dotenv from 'dotenv';
import { GET_COLLECTION_PRODUCTS } from '../graphql/collections.js';

dotenv.config();

const SHOPIFY_ADMIN_API = `https://${process.env.SHOP}/admin/api/2024-04/graphql.json`;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

export async function getVariantMetafieldsByCollection(collectionId) {
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_TOKEN,
  };

  const variables = {collectionId };
  const data = await request(SHOPIFY_ADMIN_API, GET_COLLECTION_PRODUCTS, variables, headers);

  const collection = data.collection;
  const EXCLUDED_KEYS = ['imagenes_variante'];

  const keys = new Map(); 

  for (const product of collection.products.nodes) {
    for (const variant of product.variants.nodes) {
      for (const edge of variant.metafields.edges) {
        const { key } = edge.node;
        if (EXCLUDED_KEYS.includes(key)) continue;
        keys.set(key, key); 
      }
    }
  }

  return Array.from(keys.entries()).map(([key, name]) => ({ key, name }));
}

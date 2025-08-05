import { request } from 'graphql-request';
import dotenv from 'dotenv';
import { GET_METAOBJECT_BY_COLLECTION_ID } from '../graphql/getFilterMf.js';

dotenv.config();

const SHOPIFY_ADMIN_API = `https://${process.env.SHOP}/admin/api/2024-04/graphql.json`;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

export async function getCollectionFilterConfig(collectionId) {
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_TOKEN,
  };

  const data = await request(SHOPIFY_ADMIN_API, GET_METAOBJECT_BY_COLLECTION_ID, {}, headers);

  // Busca la colección específica por ID
  const collection = data.collections.nodes.find((node) => node.id === collectionId);

  if (!collection || !collection.metafield?.value) {
    console.log(`⛔ No hay configuración para la colección: ${collectionId}`);
    return { mostrar: [] };
  }

  console.log("✅ Config encontrada para", collection.title, collection.metafield.value);

  try {
    return {
      mostrar: JSON.parse(collection.metafield.value),
    };
  } catch (e) {
    console.error("❌ Error al parsear JSON del metafield:", e);
    return { mostrar: [] };
  }
}

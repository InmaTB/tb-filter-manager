// models/indexCollection.jsx
import { request } from 'graphql-request';
import dotenv from 'dotenv';
import { GET_COLLECTION_PRODUCTS } from '../graphql/getCollectionProducts.gql.js';
import { createOrUpdateMetaobject } from './saveCollectionFilterConfig.js'; // lo crearemos ahora

dotenv.config();

const SHOPIFY_ADMIN_API = `https://${process.env.SHOP}/admin/api/2024-04/graphql.json`;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

const COLLECTION_ID = 'gid://shopify/Collection/637320528193';

export async function indexCollection(collectionId = COLLECTION_ID) {
  try {
    const headers = {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    };

    const variables = { id: collectionId };
    const data = await request(SHOPIFY_ADMIN_API, GET_COLLECTION_PRODUCTS, variables, headers);

    const collection = data.collection;
    const EXCLUDED_KEYS = ['imagenes_variante'];

    const allValues = {};

    for (const product of collection.products.nodes) {
      for (const variant of product.variants.nodes) {
        for (const edge of variant.metafields.edges) {
          const { key, value } = edge.node;
          if (EXCLUDED_KEYS.includes(key)) continue;
          if (!allValues[key]) allValues[key] = new Set();
          allValues[key].add(value);
        }
      }
    }

    const metafields = {};
    for (const key in allValues) {
      metafields[key] = Array.from(allValues[key]);
    }

    console.log('Resultado agrupado:', metafields);

    // Guardamos en metaobjeto en lugar de base de datos
    await createOrUpdateMetaobject({
      collectionId: collection.id,
      handle: collection.handle,
      data: { indexado: metafields }
    });

    console.log('Guardado en metaobjeto ✅');
  } catch (err) {
    console.error('Error al indexar colección:', err);
  }
}

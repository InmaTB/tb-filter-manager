// import { request } from "graphql-request";
// import dotenv from "dotenv";
// import { GET_COLLECTION_PRODUCTS } from "../graphql/collections.js";

// dotenv.config();

// const SHOPIFY_ADMIN_API = `https://${process.env.SHOP}/admin/api/2024-04/graphql.json`;
// const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

// /**
//  * @param {string} collectionGid - Debe ser un GID: "gid://shopify/Collection/123..."
//  * @returns {Promise<Array<{ key: string, values: string[] }>>}
//  */
// export async function getVariantMetafieldsByCollection(collectionGid) {
//   const headers = { "X-Shopify-Access-Token": SHOPIFY_TOKEN };

//   // Si tu query ya pagina productos/variantes, perfecto.
//   // Aquí hacemos una sola llamada tal cual la tienes.
//   const variables = { collectionId: collectionGid };
//   const data = await request(SHOPIFY_ADMIN_API, GET_COLLECTION_PRODUCTS, variables, headers);

//   const collection = data?.collection;
//   if (!collection) return [];

//   const acc = new Map(); // key -> Set(values)

//   for (const product of collection.products?.nodes || []) {
//     for (const variant of product.variants?.nodes || []) {
//       for (const edge of variant.metafields?.edges || []) {
//         const node = edge?.node;
//         if (!node) continue;
//         const { key, value } = node;
//         if (!key || value == null) continue;

//         if (!acc.has(key)) acc.set(key, new Set());
//         acc.get(key).add(String(value));
//       }
//     }
//   }

//   console.log("esto es acc", acc)

//   // Salida normalizada y ordenada
//   return Array.from(acc.entries()).map(([key, setValues]) => ({
//     key,
//     values: Array.from(setValues).sort((a, b) =>
//       a.localeCompare(b, undefined, { sensitivity: "base" })
//     ),
//   }));
// }

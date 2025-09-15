// app/models/productFilter.server.js
// import { storefront } from "../lib/shopify";
// import gql from "graphql-tag";

// function buildIdentifiersFragment(configMostrar = []) {
//   if (!Array.isArray(configMostrar)) return "";

//   const identifiers = configMostrar
//     .filter(item => item.tipo === "metafield" && item.namespace && item.key)
//     .map(item => `{ namespace: "${item.namespace}", key: "${item.key}" }`)
//     .join("\n");

//   return `metafields(identifiers: [\n${identifiers}\n]) {\n  namespace\n  key\n  value\n}`;
// }

// export async function getVariantMetafieldsValues(collectionHandle, configMostrar) {
//   const identifiersFragment = buildIdentifiersFragment(configMostrar);

//   console.log("identificadores",identifiersFragment);

//   const QUERY = `
//     query ProductsWithMetafields($handle: String!) {
//       collection(handle: $handle) {
//         products(first: 100) {
//           nodes {
//             variants(first: 100) {
//               nodes {
//                 ${identifiersFragment}
//               }
//             }
//           }
//         }
//       }
//     }
//   `;

//   const { data } = await storefront({ query: QUERY, variables: { handle: collectionHandle } });
//   return data?.collection?.products || [];
// }


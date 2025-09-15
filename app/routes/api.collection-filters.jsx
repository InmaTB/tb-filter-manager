// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// export const loader = async ({ request }) => {
//   const url = new URL(request.url);
//   const handle = url.searchParams.get("handle");

//   const storefrontToken = process.env.STOREFRONT_API_TOKEN;
//   const shop = process.env.SHOP;

//   // ✅ 1. Obtener keys de metacampos desde tu DB
//   const index = await prisma.collectionFilterIndex.findFirst({
//     where: { handle },
//   });

//   if (!index) {
//     return new Response('Índice no encontrado', { status: 404 });
//   }

//   const metafieldKeys = Object.keys(index.metafields); // ejemplo: ["color", "acabado", "material"]

//   // ✅ 2. Construir fragmento dinámico
//   const metafieldFields = metafieldKeys.map(key =>
//     `metafield_${key}: metafield(namespace: "upng", key: "${key}") { value }`
//   ).join('\n');

//   // ✅ 3. Armar la query con el fragmento
//   const query = `
//     query FiltersFromCollection($handle: String!) {
//       collection(handle: $handle) {
//         products(first: 100) {
//           nodes {
//             variants(first: 10) {
//               nodes {
//                 ${metafieldFields}
//               }
//             }
//           }
//         }
//       }
//     }
//   `;

//   const variables = { handle };
//   const response = await fetch(`https://${shop}/api/2024-01/graphql.json`, {
//     method: "POST",
//     headers: {
//       "X-Shopify-Storefront-Access-Token": storefrontToken,
//       "Content-Type": "application/json",
//       "Access-Control-Allow-Origin": "*",
//     },
//     body: JSON.stringify({ query, variables }),
//   });

//   const { data } = await response.json();

//   const productos = data?.collection?.products?.nodes || [];

//   // 🧠 Indexar valores únicos
//   const filtros = {};
//   for (const key of metafieldKeys) {
//     filtros[key] = new Set();
//   }

//   for (const producto of productos) {
//     for (const variante of producto.variants.nodes) {
//       for (const key of metafieldKeys) {
//         const campo = variante[`metafield_${key}`];
//         if (campo?.value) {
//           filtros[key].add(campo.value);
//         }
//       }
//     }
//   }

//   // 🔄 Generar HTML dinámico
//   const filtrosHTML = Object.entries(filtros).map(([key, values]) => {
//     if (values.size === 0) return '';
//     return `
//       <fieldset>
//         <legend>${key}</legend>
//         ${Array.from(values).map(val => `
//           <label>
//             <input type="checkbox" name="${key}" value="${val}">
//             ${val}
//           </label>
//         `).join('')}
//       </fieldset>
//     `;
//   }).join('');

//   const ordenHTML = `
//     <label>Ordenar por:
//       <select name="sortKey">
//         <option value="TITLE">Título</option>
//         <option value="PRICE">Precio</option>
//         <option value="CREATED_AT">Fecha</option>
//       </select>
//     </label>
//     <label>
//       <input type="checkbox" name="reverse" value="true">
//       Orden descendente
//     </label>
//   `;

//   const html = `
//     <aside class="filtros-coleccion">
//       <form id="filtros-form">
//         ${filtrosHTML}
//         <hr />
//         ${ordenHTML}
//         <button type="submit">Aplicar</button>
//       </form>
//     </aside>
//   `;

//   return new Response(html, {
//     headers: {
//       "Content-Type": "text/html",
//       "Access-Control-Allow-Origin": "*",
//     },
//   });
// };

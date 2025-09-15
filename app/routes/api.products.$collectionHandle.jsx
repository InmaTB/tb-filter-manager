// import { PrismaClient } from '@prisma/client';
// import { storefrontQuery } from '../lib/shopify';

// const prisma = new PrismaClient();

// export async function loader({ params, request }) {
//   try {
//     const { collectionHandle } = params;
//     const url = new URL(request.url);
//     const filters = Object.fromEntries(url.searchParams);

//     console.log("🟢 Params:", params);
//     console.log("🟢 Filters:", filters);

//     // ✅ Extraer ordenamiento
//     const sortKey = filters.sortKey || 'TITLE';
//     const reverse = filters.reverse === 'true';

//     // ✅ Limpiar filtros para excluir sortKey y reverse
//     const filtrosActivos = Object.entries(filters).filter(([key, val]) =>
//       val != null && val !== '' && key !== 'sortKey' && key !== 'reverse'
//     );

//     console.log("🧪 Filtros activos:", filtrosActivos);
//     console.log("⬇️ Orden:", { sortKey, reverse });

//     // ✅ Query dinámica
//     const query = `
//       query ProductsInCollection($handle: String!, $sortKey: ProductCollectionSortKeys, $reverse: Boolean!) {
//         collection(handle: $handle) {
//           products(first: 100, sortKey: $sortKey, reverse: $reverse) {
//             nodes {
//               id
//               title
//               handle
//               featuredImage {
//                 url
//                 altText
//               }
//               variants(first: 10) {
//                 nodes {
//                   id
//                   metafield_acabado: metafield(namespace: "upng", key: "acabado") {
//                     value
//                   }
//                   metafield_color: metafield(namespace: "upng", key: "color") {
//                     value
//                   }
//                   metafield_material: metafield(namespace: "upng", key: "material") {
//                     value
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     `;

//     const variables = {
//       handle: collectionHandle,
//       sortKey,
//       reverse
//     };

//     const data = await storefrontQuery({ query, variables });
//     const productos = data.collection?.products?.nodes || [];

//     const productosFiltrados = productos.filter(producto => {
//       const variantesFiltradas = producto.variants.nodes.filter(variant => {
//         return filtrosActivos.every(([filtroKey, filtroValue]) => {
//           const campo = `metafield_${filtroKey}`;
//           const metafield = variant[campo];
//           return metafield?.value?.toLowerCase() === filtroValue.toLowerCase();
//         });
//       });
//       return variantesFiltradas.length > 0;
//     });

//     // console.log(`🎯 Total productos filtrados: ${productosFiltrados.length}`);

//     return new Response(JSON.stringify({
//       productos: productosFiltrados.map(p => p.handle)
//     }), {
//       status: 200,
//       headers: {
//         'Content-Type': 'application/json',
//         'Access-Control-Allow-Origin': '*'
//       }
//     });

//   } catch (err) {
//     console.error('❌ Error en loader:', err);
//     return new Response(JSON.stringify({ error: err.message }), {
//       status: 500,
//       headers: {
//         'Content-Type': 'application/json',
//         'Access-Control-Allow-Origin': '*'
//       }
//     });
//   }
// }

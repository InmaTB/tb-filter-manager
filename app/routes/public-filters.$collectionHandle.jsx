// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// export async function loader({ params, request }) {
//   const { collectionHandle } = params;

//   const collection = await prisma.collectionFilterIndex.findFirst({
//     where: {
//       handle: collectionHandle,
//     }
//   });

//   if (!collection) {
//     return new Response('No encontrado', { status: 404 });
//   }

//   const metafields = collection.metafields;

//   const filtrosHTML = Object.entries(metafields).map(([key, values]) => `
//     <fieldset>
//       <legend>${key}</legend>
//       ${values.map(value => `
//         <label style="display: block; margin-bottom: 4px;">
//           <input type="checkbox" name="${key}" value="${value}" />
//           ${value}
//         </label>
//       `).join('')}
//     </fieldset>
//   `).join('');

//   const ordenHTML = `
//     <fieldset>
//       <legend>Ordenar por</legend>
//       <label style="display:block; margin-bottom:4px;">
//         <select name="sortKey">
//           <option value="TITLE">Título</option>
//           <option value="PRICE">Precio</option>
//           <option value="CREATED_AT">Fecha</option>
//         </select>
//       </label>
//       <label>
//         <input type="checkbox" name="reverse" value="true" />
//         Orden descendente
//       </label>
//     </fieldset>
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
//       'Content-Type': 'text/html',
//       'Access-Control-Allow-Origin': '*',
//     },
//   });
// }

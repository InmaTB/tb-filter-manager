// import { getVariantMetafieldsValues  } from "../models/productFIlter.server"

// export async function loader({ request }) {
//   const url = new URL(request.url);
//   const collectionHandle = url.searchParams.get("collection_handle");

//   if (!collectionHandle) {
//     return new Response("Missing collection_handle", { status: 400 });
//   }

//   const rawFilters = Object.fromEntries(url.searchParams);
//   const filters = Object.keys(rawFilters)
//     .filter(k => k.startsWith("f_"))
//     .map(k => {
//       const [, namespace, key] = k.split("_");
//       return { namespace, key };
//     });

//   const products = await getVariantMetafieldsValues(collectionHandle, filters);

//   return new Response(JSON.stringify({ products }), {
//     headers: { "Content-Type": "application/json" },
//   });
// }

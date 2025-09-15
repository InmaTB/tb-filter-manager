// import { authenticate } from "../shopify.server.js";
// import { getVariantMetafieldsByCollection } from "../models/getVariantMetafieldsByCollection.js";

// export async function loader({ request }) {
//   // Valida firma de App Proxy (mismo dominio, sin CORS)
//   await authenticate.public.appProxy(request);

//   const url = new URL(request.url);
//   let collectionId = url.searchParams.get("collectionId");

//   if (!collectionId) {
//     return new Response(
//       JSON.stringify({ error: "collectionId requerido" }),
//       { status: 400, headers: { "Content-Type": "application/json" } }
//     );
//   }

//   // Acepta numérico o GID; normalizamos a GID
//   if (!/^gid:\/\//.test(collectionId)) {
//     collectionId = `gid://shopify/Collection/${collectionId}`;
//   }

//   try {
//     const metafields = await getVariantMetafieldsByCollection(collectionId);
//     console.log("mf",metafields)
//     return new Response(
//       JSON.stringify(metafields),
//       {
//         status: 200,
//         headers: {
//           "Content-Type": "application/json",
//           "Cache-Control": "public, max-age=60"
//         }
//       }
//     );
//   } catch (err) {
//     console.error("[variant-metafields] error:", err);
//     return new Response(
//       JSON.stringify({ error: "Error obteniendo metafields" }),
//       { status: 500, headers: { "Content-Type": "application/json" } }
//     );
//   }
// }

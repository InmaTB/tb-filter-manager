// // app/routes/api/admin/collections.jsx
// import { getAllCollections } from "../models/collections.server";
// import { authenticate } from "../shopify.server";

// export async function loader({ request }) {
//   const { admin } = await authenticate.admin(request);

//   const collections = await getAllCollections(admin);

//   return new Response(JSON.stringify(collections), {
//   status: 200,
//   headers: {
//     "Content-Type": "application/json",
//   },
// });

// }

import { authenticate } from "../shopify.server";
import { getCollectionFilterConfig } from "../models/getCollectionFilterConfig";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collectionId");

  console.log("📥 collectionId recibido:", collectionId);

  if (!collectionId) {
    return new Response(JSON.stringify({ error: "collectionId requerido" }), { status: 400 });
  }

  const config = await getCollectionFilterConfig(collectionId);

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

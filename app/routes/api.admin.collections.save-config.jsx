import { authenticate } from "../shopify.server";
import { postConfig } from "../models/saveCollectionConfig";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  const { collectionId, config } = body;

  if (!collectionId || !config?.mostrar) {
    return new Response(JSON.stringify({ success: false, error: "collectionId y config.mostrar requeridos" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const success = await postConfig(admin, collectionId, config);

  return new Response(JSON.stringify({ success }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

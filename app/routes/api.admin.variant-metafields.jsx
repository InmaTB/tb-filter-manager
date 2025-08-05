import { getVariantMetafieldsByCollection } from '../models/getVariantMetafieldsByCollection.js';

export async function loader({ request }) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get('collectionId');

  if (!collectionId) {
    return new Response(
      JSON.stringify({ error: 'collectionId requerido' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  const metafields = await getVariantMetafieldsByCollection(collectionId);
  return new Response(
    JSON.stringify(metafields),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

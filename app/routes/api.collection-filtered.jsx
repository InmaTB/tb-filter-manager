import { cors } from 'remix-utils/cors';
import { filterCollection } from '../models/front.sever';


export const loader = async ({ request }) => {
    try {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Shop-Domain, X-Collection, Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const shop = request.headers.get('x-shop-domain');
  const collection = request.headers.get('x-collection');

  try {
    const collectionFiltered = await filterCollection(shop, collection, params);
    return cors(
      request,
      new Response(JSON.stringify(collectionFiltered), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (error) {
    return cors(
      request,
      new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  } catch (error) {
    console.error('Error en loader:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

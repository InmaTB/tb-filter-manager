import { cors } from 'remix-utils/cors';
import { filterCollection } from '../models/front.server';


export const loader = async ({ request }) => {
    try {
      console.log(request.method)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Shop-Domain, X-Collection, X-Country, X-Language, Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const shop = request.headers.get('x-shop-domain');
  const collection = request.headers.get('x-collection');
  const country = request.headers.get('x-country');
  const language = request.headers.get('x-language');

  try {
    const collectionFiltered = await filterCollection(shop, country.toUpperCase(), language.toUpperCase(), collection, params);
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

//app.models.getCollectionFilterConfig.js
import { request } from "graphql-request";
import dotenv from "dotenv";
import { GET_METAOBJECT_BY_COLLECTION_ID } from "../graphql/getFilterMf.js";

dotenv.config();

const SHOPIFY_ADMIN_API = `https://${process.env.SHOP}/admin/api/2024-04/graphql.json`;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

export async function getCollectionFilterConfig(collectionId) {
  const headers = {
    "X-Shopify-Access-Token": SHOPIFY_TOKEN,
  };

  const variables = { collectionId };
  console.log("estp es la variable",variables)

  const data = await request(
    SHOPIFY_ADMIN_API,
    GET_METAOBJECT_BY_COLLECTION_ID,
    variables,
    headers,
  );

  // Busca la colección específica por ID
  const collection = data.collection;

  if (!collection || !collection.metafield?.value) {
    return { mostrar: [] };
  }

  console.log(
    "✅ Config encontrada para",
    collection.title,
    collection.metafield.value,
  );

  try {
    return {
      mostrar: JSON.parse(collection.metafield.value),
    };
  } catch (e) {
    console.error("❌ Error al parsear JSON del metafield:", e);
    return { mostrar: [] };
  }
}

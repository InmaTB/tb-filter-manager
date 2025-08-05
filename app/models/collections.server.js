import { GET_COLLECTIONS } from "../graphql/collections";

export async function getAllCollections(admin) {
  const response = await admin.graphql(GET_COLLECTIONS);
  const { data } = await response.json();
  return data.collections.nodes;
}

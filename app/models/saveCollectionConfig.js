
import { POST_METAFIELD_VALUE } from "../graphql/setCollectionConfig.graphql";

export async function postConfig(admin, collectionId, config) {
  const variables = {
    metafields: [
      {
        key: "config",
        namespace: "tb-filters",
        type: "json",
        ownerId: collectionId,
        value: JSON.stringify(config)
      }
    ]
  };

  const response = await admin.graphql(POST_METAFIELD_VALUE, { variables });
  const { data, errors } = await response.json();

  if (errors || data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("❌ Error al guardar config:", errors || data.metafieldsSet.userErrors);
    return false;
  }

  return true;
}

export const GET_METAOBJECT_BY_COLLECTION_ID = `
  query GetCollectionFilterConfig($collectionId: ID!) {
    collection(id: $collectionId) {
      id
      title
      metafield(namespace: "tb-filters", key: "config") {
        value
      }
    }
  }
`;





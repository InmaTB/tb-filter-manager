export const GET_METAOBJECT_BY_COLLECTION_ID = `
 query {
  collections(first: 250) {
    nodes {
      id
      title
      handle
      metafield(namespace: "tb-filters", key: "config") {
        id
        key
        namespace
        value
        type
      }
    }
  }
}
`;

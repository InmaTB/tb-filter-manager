export const GET_COLLECTIONS = `#graphql
  query{
  collections(first:250){
    nodes{
      id
      title
    }
  }
}
`;

export const GET_COLLECTION_PRODUCTS_PAGE = `#graphql
  query CollProds(
    $collectionId: ID!,
    $first: Int!,
    $after: String,
  ) {
    collection(id: $collectionId) {
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          metafields(first:250) {
            nodes {
              namespace key type value
            }
          }
          variants(first: 100) {
            nodes {
              id
              metafields(first:250) {
                nodes {
                  namespace key type value
                }
              }
            }
          }
        }
      }
    }
  }
`;

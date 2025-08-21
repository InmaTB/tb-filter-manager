export const GET_COLLECTIONS = `
  query{
  collections(first:250){
    nodes{
      id
      title
    }
  }
}
`;


export const GET_COLLECTION_PRODUCTS = `
  query GetCollectionProducts($collectionId: ID!) {
    collection(id: $collectionId) {
      products(first: 20) {
        nodes {
          variants(first: 50) {
            nodes {
              id
              metafields(first: 5) {
                edges {
                  node {
                    key
                    value
                   
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_PRODUCT_AND_VARIANT_METAFIELDS  = `#graphql
    query getMetafieldDefs {
        product: metafieldDefinitions(first: 250, ownerType: PRODUCT) {
            nodes { 
                id 
                key 
                name 
                namespace 
            }
        }
        variant: metafieldDefinitions(first: 250, ownerType: PRODUCTVARIANT) {
            nodes { 
                id 
                key 
                name 
                namespace 
            }
        }
    }
`;

// Resuelve definiciones por ID
export const GET_MFDEFS_BY_IDS = `#graphql
  query GetMfDefs($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on MetafieldDefinition {
        id
        name
        namespace
        key
        ownerType
        type { name }
      }
    }
  }
`;

// Escribe el JSON en la colección
export const METAFIELDS_SET = `#graphql
  mutation MfSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace }
      userErrors { field message code }
    }
  }
`;

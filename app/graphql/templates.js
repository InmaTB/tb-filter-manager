const TEMPLATE_TYPE = "$app:tb-filters-template";

export const CREATE_TEMPLATE_DEFINITION = `#graphql
    mutation CreateTemplateDef($definition: MetaobjectDefinitionCreateInput!) {
            metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition { id type }
            userErrors { field message code }
        }
    }
`;

export const METAOBJECT_UPSERT = `#graphql
  mutation UpsertTemplate($handle: MetaobjectHandleInput!, $input: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $input) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

export const METAOBJECT_UPDATE = `#graphql
  mutation UpdateTemplate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

export const LIST_TEMPLATES = `#graphql
  query ListTemplates($first: Int!, $after: String) {
    metaobjects(type: "${TEMPLATE_TYPE}", first: $first, after: $after, reverse: true) {
      edges {
        cursor
        node {
          id
          handle
          title: field(key: "title") { value }
          active: field(key: "active") { value }
          filters: field(key: "filters") { value }
          collections: field(key: "collections") {
            references(first: 250) {
              nodes { ... on Collection { id title handle } }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// Una plantilla por ID 
export const GET_TEMPLATE_BY_ID = `#graphql
  query GetTemplateById($id: ID!) {
    metaobject(id: $id) {
      id
      handle
      type
      title: field(key: "title") { value }
      active: field(key: "active") { value }
      filters: field(key: "filters") { value }
      collections: field(key: "collections") {
        references(first: 250) {
          nodes { ... on Collection { id title handle } }
        }
      }
      include_vendor: field(key: "include_vendor") { value }
      include_availability: field(key: "include_availability") { value }
      include_price: field(key: "include_price") { value }
      filters_order: field(key: "filters_order") { value }
      filters_labels: field(key: "filters_labels") { value }
    }
  }
`;

export const METAOBJECT_DELETE = `#graphql
  mutation MetaobjectDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;
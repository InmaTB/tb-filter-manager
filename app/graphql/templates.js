const TEMPLATE_TYPE = "$app:tb-filters-template";

export const GET_TEMPLATE_DEFINITION = `#graphql
  query ($type: String!) {
    metaobjectDefinitionByType(type: $type) { id type }
  }
`;

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

// Una plantilla por handle
export const GET_TEMPLATE_BY_HANDLE = `#graphql
  query GetTemplateByHandle($handle: String!) {
    metaobject(handle: {type:"${TEMPLATE_TYPE}", handle: $handle}) {
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
    }
  }
`;
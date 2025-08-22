// models/templates.server.js

import { GET_COLLECTIONS, GET_COLLECTION_PRODUCTS_PAGE } from "../graphql/collections";
import { GET_PRODUCT_AND_VARIANT_METAFIELDS, GET_MFDEFS_BY_IDS, METAFIELDS_SET} from "../graphql/metafields";
import {
  GET_TEMPLATE_DEFINITION,
  CREATE_TEMPLATE_DEFINITION,
  METAOBJECT_UPSERT,
  METAOBJECT_UPDATE,
  LIST_TEMPLATES,
  GET_TEMPLATE_BY_HANDLE,
  GET_TEMPLATE_BY_ID,
} from "../graphql/templates";

const TEMPLATE_TYPE = "$app:tb-filters-template";
const toBool = (v) => String(v ?? "false").toLowerCase() === "true";

// ====== NUEVO: constantes del metacampo de Colección ======
const COLLECTION_FILTERS_NS = "tb-filters";
const COLLECTION_FILTERS_KEY = "config";


// ====== Helpers ======
const asArr = (x) => Array.isArray(x) ? x : [];
const isGid = (s, prefix) => typeof s === "string" && s.startsWith(prefix);

function uniqSorted(arr) {
  return [...new Set(asArr(arr).map(String))].filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));
}

// Normaliza el value de un metafield a lista de strings
function explodeValue(mf) {
  if (!mf || mf.value == null) return [];
  const t = mf.type || ""; // p.ej. "single_line_text_field", "list.single_line_text_field", "json"
  const v = mf.value;

  if (t.startsWith("list.") || t === "json") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed).map((x) => String(x)).filter(Boolean);
      }
    } catch {
      return [String(v)];
    }
  }
  return [String(v)];
}

// Resuelve definiciones a {namespace,key,ownerType}
async function getDefinitionsByIds(graphql, filtersIds) {
  const ids = asArr(filtersIds).filter((id) =>
    isGid(id, "gid://shopify/MetafieldDefinition/")
  );
  if (ids.length === 0) return { product: [], variant: [] };

  const resp = await graphql(GET_MFDEFS_BY_IDS, { variables: { ids } });
  const json = await resp.json();
  const nodes = asArr(json?.data?.nodes).filter(Boolean);

  const defObjs = nodes.map((n) => ({
    id: n.id,
    namespace: n.namespace,
    key: n.key,
    ownerType: n.ownerType, // "PRODUCT" | "PRODUCTVARIANT"
    type: n.type?.name || null,
  }));

  return {
    product: defObjs.filter((d) => d.ownerType === "PRODUCT"),
    variant: defObjs.filter((d) => d.ownerType === "PRODUCTVARIANT"),
  };
}

// Calcula el mapa { "ns.key": ["val1","val2", ...] } para una colección
async function computeCollectionFiltersMap(graphql, collectionId, prodDefs, varDefs) {
  const prodIds = asArr(prodDefs).map((d) => ({ namespace: d.namespace, key: d.key }));
  const varIds  = asArr(varDefs).map((d) => ({ namespace: d.namespace, key: d.key }));

  // Si no hay defs, no hay nada que calcular
  if (prodIds.length === 0 && varIds.length === 0) return {};

  const acc = new Map(); // "ns.key" -> Set(values)
  const push = (ns, key, values) => {
    if (!ns || !key) return;
    const k = `${ns}.${key}`;
    if (!acc.has(k)) acc.set(k, new Set());
    const set = acc.get(k);
    asArr(values).forEach((v) => {
      const s = String(v || "").trim();
      if (s) set.add(s);
    });
  };

  let after = null;
  const FIRST = 50; // página de productos
  do {
    const resp = await graphql(GET_COLLECTION_PRODUCTS_PAGE, {
      variables: {
        collectionId,
        first: FIRST,
        after,
        prodIds,
        varIds,
      },
    });
    const json = await resp.json();
    const products = json?.data?.collection?.products;
    const pageInfo = products?.pageInfo || {};
    after = pageInfo?.hasNextPage ? pageInfo.endCursor : null;

    for (const p of asArr(products?.nodes)) {
      // product-level
      for (const mf of asArr(p.metafields)) {
        push(mf.namespace, mf.key, explodeValue(mf));
      }
      // variant-level
      for (const v of asArr(p.variants?.nodes)) {
        for (const mf of asArr(v.metafields)) {
          push(mf.namespace, mf.key, explodeValue(mf));
        }
      }
    }
  } while (after);

  const out = {};
  for (const [k, set] of acc.entries()) out[k] = uniqSorted([...set]);
  return out;
}

// Escribe el JSON en el metafield de la colección
async function writeCollectionFiltersJson(graphql, collectionId, filtersMap) {
  const resp = await graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: collectionId,
          namespace: COLLECTION_FILTERS_NS,
          key: COLLECTION_FILTERS_KEY, // "filters"
          type: "json",
          value: JSON.stringify(filtersMap || {}),
        },
      ],
    },
  });
  const json = await resp.json();
  const errs = json?.data?.metafieldsSet?.userErrors;
  if (errs?.length) {
    throw new Error(
      `metafieldsSet (${collectionId}): ${errs.map((e) => e.message).join("; ")}`
    );
  }
}

// ================================================
//           TUS FUNCIONES EXISTENTES
// ================================================
export async function getTemplates(graphql, opts = {}) {
  await ensureTemplateDefinition(graphql);
  const { id, handle, first = 50, after = null } = opts;

  if (id) {
    const q = await graphql(GET_TEMPLATE_BY_ID, { variables: { id } });
    const jq = await q.json();
    const node = jq?.data?.metaobject;
    return node ? [normalizeNode(node)] : [];
  }

  if (handle) {
    const q = await graphql(GET_TEMPLATE_BY_HANDLE, { variables: { handle } });
    const jq = await q.json();
    const node = jq?.data?.metaobject;
    return node ? [normalizeNode(node)] : [];
  }

  const q = await graphql(LIST_TEMPLATES, { variables: { first, after } });
  const jq = await q.json();
  const edges = jq?.data?.metaobjects?.edges || [];
  return edges.map(({ node }) => normalizeNode(node));
}

export async function saveTemplate(graphql, id, templateJSONString) {
  const template = JSON.parse(templateJSONString || "{}");
  const {
    title = "",
    collectionIds = [],     // GIDs de Collection
    filtersIds = [],        // GIDs de MetafieldDefinition
    active = true,
  } = template;

  await ensureTemplateDefinition(graphql);

  // --- upsert/update del metaobjeto (tal como tenías) ---
  const fields = [
    { key: "title",       value: String(title) },
    { key: "collections", value: JSON.stringify(collectionIds) },
    { key: "filters",     value: JSON.stringify(filtersIds) },
    { key: "active",      value: String(!!active) },
  ];

  let upsertedOrUpdated = null;

  if (String(id).startsWith("gid://shopify/Metaobject/")) {
    const resp = await graphql(METAOBJECT_UPDATE, {
      variables: { id, input: { fields } },
    });
    const json = await resp.json();
    const errs = json?.data?.metaobjectUpdate?.userErrors;
    if (errs?.length) return { errors: errs };
    upsertedOrUpdated = json?.data?.metaobjectUpdate?.metaobject;
  } else {
    const normalized =
      String(title || "untitled")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const handleValue = id === "0" ? `tpl-${Date.now()}-${normalized}` : `tpl-${id}`;

    const resp = await graphql(METAOBJECT_UPSERT, {
      variables: {
        handle: { type: TEMPLATE_TYPE, handle: handleValue },
        input:  { fields },
      },
    });
    const json = await resp.json();
    const errs = json?.data?.metaobjectUpsert?.userErrors;
    if (errs?.length) return { errors: errs };
    upsertedOrUpdated = json?.data?.metaobjectUpsert?.metaobject;
  }

  // --- NUEVO: calcular y guardar filtros por colección ---
  // 1) Resuelve definiciones seleccionadas
  const { product: prodDefs, variant: varDefs } =
    await getDefinitionsByIds(graphql, filtersIds);

  // 2) Recorre colecciones y escribe el JSON de filtros disponibles
  const cleanCollectionIds = asArr(collectionIds).filter((gid) =>
    isGid(gid, "gid://shopify/Collection/")
  );

  for (const collId of cleanCollectionIds) {
    // Si no hay defs, guarda {} y sigue
    if (prodDefs.length === 0 && varDefs.length === 0) {
      await writeCollectionFiltersJson(graphql, collId, {});
      continue;
    }
    const filtersMap = await computeCollectionFiltersMap(
      graphql,
      collId,
      prodDefs,
      varDefs
    );
    await writeCollectionFiltersJson(graphql, collId, filtersMap);
  }

  return { success: true, metaobject: upsertedOrUpdated };
}

export async function getAllCollections(graphql) {
  const response = await graphql(GET_COLLECTIONS);
  const { data } = await response.json();
  return data.collections.nodes;
}

export async function getAllFilters(graphql) {
  const res = await graphql(GET_PRODUCT_AND_VARIANT_METAFIELDS);
  const { data } = await res.json();
  const productDefs = data?.product?.nodes ?? [];
  const variantDefs = data?.variant?.nodes ?? [];
  return buildSectionedOptions(productDefs, variantDefs);
}

function mapDefsToOptions(defs, ownerType) {
  return (defs ?? []).map((d) => ({
    value: d.id,
    label: `${d.name} — ${d.namespace}.${d.key}`,
  }));
}

function buildSectionedOptions(productDefs, variantDefs) {
  return [
    { title: "Product", options: mapDefsToOptions(productDefs, "PRODUCT") },
    { title: "Variant", options: mapDefsToOptions(variantDefs, "PRODUCTVARIANT") },
  ];
}

async function ensureTemplateDefinition(graphql) {
  const definition = {
    name: "TB Filters Templates",
    type: TEMPLATE_TYPE,
    fieldDefinitions: [
      { key: "title",       name: "Title",       type: "single_line_text_field" },
      { key: "collections", name: "Collections", type: "list.collection_reference" },
      { key: "filters",     name: "Filters",     type: "json" },
      { key: "active",      name: "Active",      type: "boolean" },
    ],
    access: {
      admin: "MERCHANT_READ_WRITE",
      storefront: "NONE",
    },
  };

  const res = await graphql(CREATE_TEMPLATE_DEFINITION, { variables: { definition } });
  const json = await res.json();

  const err = json?.data?.metaobjectDefinitionCreate?.userErrors?.[0];
  if (err && err?.code !== "TAKEN" && err?.message !== "Type has already been taken") {
    throw new Error(
      `metaobjectDefinitionCreate: ${err.code || ""} ${err.message}`
    );
  }
  return json;
}

function normalizeNode(node) {
  let filtersIds = [];
  try {
    filtersIds = JSON.parse(node?.filters?.value ?? "[]");
  } catch {}
  const collections =
    node?.collections?.references?.nodes?.map((c) => ({
      id: c.id,
      title: c.title,
      handle: c.handle,
    })) ?? [];
  return {
    id: node.id,
    handle: node.handle,
    title: node?.title?.value ?? null,
    active: toBool(node?.active?.value),
    filtersIds,
    collections,
  };
}

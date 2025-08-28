import { GET_COLLECTIONS } from "../graphql/collections";
import { GET_PRODUCT_AND_VARIANT_METAFIELDS, GET_MFDEFS_BY_IDS, METAFIELDS_SET } from "../graphql/metafields";
import {
  CREATE_TEMPLATE_DEFINITION,
  METAOBJECT_UPSERT,
  METAOBJECT_UPDATE,
  LIST_TEMPLATES,
  GET_TEMPLATE_BY_ID,
  METAOBJECT_DELETE 
} from "../graphql/templates";

const TEMPLATE_TYPE = "$app:tb-filters-template";
const COLLECTION_FILTERS_NS = "tb-filters";
const COLLECTION_FILTERS_KEY = "config";

// ================================================
//           UTILS
// ================================================
const toBool = (v) => String(v ?? "false").toLowerCase() === "true";
const asArr = (x) => (Array.isArray(x) ? x : []);
const isGid = (s, prefix) => typeof s === "string" && s.startsWith(prefix);

// Uniq case-insensitive + orden local "es"
function uniqSorted(arr) {
  const seen = new Set();
  const out = [];
  for (const raw of asArr(arr)) {
    const s = String(raw).trim();
    if (!s) continue;
    const k = s.toLocaleLowerCase("es");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "es"));
}

// Normaliza el value de un metafield a lista de strings
function explodeValue(mf) {
  if (!mf || mf.value == null) return [];
  const t = mf.type || "";
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

/**
 * Builder de query: trae SOLO los metafields definidos en la template
 * usando aliases estables (p_mf0, v_mf0, ...).
 */
function buildSelectedMfQuery(prodDefs = [], varDefs = [], pageSize = 50) {
  const prodSel = prodDefs
    .map(
      (d, i) =>
        `p_mf${i}: metafield(namespace: "${d.namespace}", key: "${d.key}") { id namespace key type value definition { name ownerType } }`
    )
    .join("\n");

  const varSel = varDefs
    .map(
      (d, i) =>
        `v_mf${i}: metafield(namespace: "${d.namespace}", key: "${d.key}") { id namespace key type value definition { name ownerType } }`
    )
    .join("\n");

  // Si un bloque queda vacío, incluimos un alias inofensivo para que el bloque no sea vacío.
  const productBlock = prodSel ? prodSel : `__prodEmpty: id`;
  const variantBlock = varSel ? varSel : `__varEmpty: id`;

  const query = `#graphql
    query CollProdsSelected($collectionId: ID!, $first: Int!, $after: String) {
      collection(id: $collectionId) {
        products(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            vendor
            ${productBlock}
            variants(first: 100) {
              nodes {
                id
                inventoryQuantity
                v_mfpermite: metafield(namespace: "upng", key: "permite_pedidos") { value }
                v_mffecha: metafield(namespace: "upng", key: "fecha-proxima-llegada") { value }
                ${variantBlock}
              }
            }
          }
        }
      }
    }
  `;

  // Mapas alias -> "ns.key"
  const prodAlias = new Map(
    prodDefs.map((d, i) => [`p_mf${i}`, `${d.namespace}.${d.key}`])
  );
  const varAlias = new Map(
    varDefs.map((d, i) => [`v_mf${i}`, `${d.namespace}.${d.key}`])
  );

  return { query, prodAlias, varAlias, pageSize };
}

/**
 * Calcula el mapa { "ns.key": ["v1","v2", ...] } trayendo SOLO los metafields
 * seleccionados en la template (product + variant), usando la query con aliases.
 */
async function computeCollectionFiltersMapSelected(graphql, collectionId, prodDefs, varDefs) {
  const hasProd = asArr(prodDefs).length > 0;
  const hasVar = asArr(varDefs).length > 0;
  if (!hasProd && !hasVar) return [];

  const { query, prodAlias, varAlias, pageSize } = buildSelectedMfQuery(
    prodDefs.map((d) => ({ namespace: d.namespace, key: d.key })),
    varDefs.map((d) => ({ namespace: d.namespace, key: d.key })),
    50
  );

  const acc = new Map(); //Acumulador de filtros

  // Prepara el filtro para vendor (siempre estará disponible)
  acc.set("vendor", {
    key: "vendor",
    type: "vendor",
    label: "Vendor",
    param_name: "filter.p.vendor",
    presentation: '',
    active_values: [],
    values: new Map(),
  });

  acc.set("availability", {
    key: "availability",
    type: "availability",
    label: "Disponibilidad",
    param_name: "filter.v.availability",
    presentation: '',
    active_values: [],
    values: new Map(),
  });

  const push = (mf) => {
    if (!mf?.namespace || !mf?.key || !mf?.value || !mf?.id || !mf?.type) return;

    const ns = mf.namespace;
    const key = mf.key;
    const type = mf.type;
    const label = mf.definition?.name || `${ns}.${key}`;
    const ownerType = mf.definition?.ownerType;
    const compositeKey = `${ns}.${key}`;
    const active_values = [];
    let ownerTypeSort = '';
    if (ownerType === 'PRODUCT') {
      ownerTypeSort = 'p';
    } else if (ownerType === 'PRODUCTVARIANT') {
      ownerTypeSort = 'v';
    }

    let presentation = ''
    if (key.toLowerCase().startsWith('color')) {
      presentation = 'swatch';
    }    
      
    const param_name = `filter.${ownerTypeSort}.${ns}.${key}`;

    if (!acc.has(compositeKey)) {
      acc.set(compositeKey, {
        namespace: ns,
        key,
        label,
        type,
        param_name,
        presentation,
        active_values,
        values: new Map(),
      });
    }

    const entry = acc.get(compositeKey);
    for (const val of explodeValue(mf)) {
      const trimmedVal = String(val || "").trim();
      if (!trimmedVal) continue;
      if (!entry.values.has(trimmedVal)) {
        entry.values.set(trimmedVal, {
          id: mf.id,
          value: trimmedVal,
          label: trimmedVal,
          count: 1,
          active: false,
          param_name,
        });
      } else {
        entry.values.get(trimmedVal).count += 1;
      }
    }
  };


  let after = null;
  do {
    const resp = await graphql(query, {
      variables: { collectionId, first: pageSize, after },
    });
    const json = await resp.json();
    const products = json?.data?.collection?.products;
    const pageInfo = products?.pageInfo || {};
    after = pageInfo?.hasNextPage ? pageInfo.endCursor : null;

    for (const p of asArr(products?.nodes)) {
      for (const [alias] of prodAlias) {
        const mf = p?.[alias];
        if (mf && mf.value != null) push(mf);
      }
      for (const v of asArr(p.variants?.nodes)) {
        for (const [alias] of varAlias) {
          const mf = v?.[alias];
          if (mf && mf.value != null) push(mf);
        }
      }

      const vendor = String(p?.vendor || "").trim();
      if (vendor) {
        const entry = acc.get("vendor");
        console.log(entry)
        if (!entry.values.has(vendor)) {
          console.log(vendor)
          entry.values.set(vendor, {
            id: vendor,
            value: vendor,
            label: vendor,
            count: 1,
            active: false,
            param_name: entry.param_name,
          });
        } else {
          entry.values.get(vendor).count += 1;
        }
      }
      const variants = asArr(p?.variants?.nodes);
      const hasStock = variants.some(v => Number(v?.inventoryQuantity || 0) > 0);

      const availabilityEntry = acc.get("availability");
      const availKey = hasStock ? "available" : "unavailable";
      const availLabel = hasStock ? "Disponible" : "Agotado";

      if (!availabilityEntry.values.has(availKey)) {
        availabilityEntry.values.set(availKey, {
          id: availKey,
          value: availKey,
          label: availLabel,
          count: 1,
          active: false,
          param_name: availabilityEntry.param_name,
        });
      } else {
        availabilityEntry.values.get(availKey).count += 1;
      }
    }
  } while (after);

  const out = [];
  for (const { namespace, key, label, type, param_name, presentation, active_values, values } of acc.values()) {
    const sortedEntries = uniqSorted([...values.values()].map(v => v.value)).map(val => {
      const entry = values.get(val);
      return {
        id: entry?.id,
        value: val,
        label: val,
        count: entry?.count ?? 0,
        active: false,
        param_name
      };
    });

    out.push({
      filter: {
        label,
        namespace,
        key,
        type,
        param_name,
        presentation,
        active_values,
        values: sortedEntries,
      },
    });
  }

  console.log(out)

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
          key: COLLECTION_FILTERS_KEY, // "config"
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

function mapDefsToOptions(defs) {
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
      { key: "title", name: "Title", type: "single_line_text_field" },
      { key: "collections", name: "Collections", type: "list.collection_reference" },
      { key: "filters", name: "Filters", type: "json" },
      { key: "active", name: "Active", type: "boolean" },
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

const toMetaobjectGid = (maybeId) => {
  const s = String(maybeId ?? '');
  if (!s) return s;
  if (s === '0') return s; // sentinel de "crear"
  return s.startsWith('gid://shopify/Metaobject/') ? s : `gid://shopify/Metaobject/${s}`;
};

// ================================================
//           EXPORTS
// ================================================
export async function getTemplates(graphql, opts = {}) {
  await ensureTemplateDefinition(graphql);
  const { id, first = 50, after = null } = opts;

  if (id) {
    const gid = toMetaobjectGid(id);
    const q = await graphql(GET_TEMPLATE_BY_ID, { variables: { id: gid } });
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

  console.log('id', id)
  const gid = toMetaobjectGid(id);

  const template = JSON.parse(templateJSONString || "{}");
  const {
    title = "",
    collectionIds = [], // GIDs de Collection
    filtersIds = [], // GIDs de MetafieldDefinition
    active = true,
  } = template;

  await ensureTemplateDefinition(graphql);

  // --- upsert/update del metaobjeto (tal como tenías) ---
  const fields = [
      { key: "title", value: String(title) },
      { key: "collections", value: JSON.stringify(collectionIds) },
      { key: "filters", value: JSON.stringify(filtersIds) },
      { key: "active", value: String(!!active) },
  ]
  ;

  let upsertedOrUpdated = null;

  if (gid.startsWith("gid://shopify/Metaobject/") && gid !== "0") {
    const resp = await graphql(METAOBJECT_UPDATE, {
      variables: { id: gid, metaobject: { fields } },
    });
    const json = await resp.json();
    const errs = json?.data?.metaobjectUpdate?.userErrors;
    if (errs?.length) return { errors: errs };
    upsertedOrUpdated = json?.data?.metaobjectUpdate?.metaobject;
  } else {
    const normalized = String(title || "untitled")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const handleValue = id === "0" ? `tpl-${Date.now()}-${normalized}` : `tpl-${id}`;

    const resp = await graphql(METAOBJECT_UPSERT, {
      variables: {
        handle: { type: TEMPLATE_TYPE, handle: handleValue },
        input: { fields },
      },
    });
    const json = await resp.json();
    const errs = json?.data?.metaobjectUpsert?.userErrors;
    if (errs?.length) return { errors: errs };
    upsertedOrUpdated = json?.data?.metaobjectUpsert?.metaobject;
  }

  // --- NUEVO: calcular y guardar filtros por colección ---
  // 1) Resuelve definiciones seleccionadas
  const { product: prodDefs, variant: varDefs } = await getDefinitionsByIds(
    graphql,
    filtersIds
  );

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

    // Usar versión "selected" (solo metafields de template)
    const filtersMap = await computeCollectionFiltersMapSelected(
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

export async function removeTemplate(graphql, id) {
  if (!isGid(id, "gid://shopify/Metaobject/")) {
    return { errors: [{ message: `ID inválido: ${id}` }] };
  }
  const resp = await graphql(METAOBJECT_DELETE, { variables: { id } });
  const json = await resp.json();

  const errs = json?.data?.metaobjectDelete?.userErrors || [];
  if (errs.length) return { errors: errs };

  const deletedId = json?.data?.metaobjectDelete?.deletedId;
  if (!deletedId) return { errors: [{ message: "No se pudo eliminar la plantilla" }] };

  return { success: true, deletedId };
}

export async function updateTemplateStatus(graphql, id, newStatus) {
  if (!isGid(id, "gid://shopify/Metaobject/")) {
    return { errors: [{ message: `ID inválido: ${id}` }] };
  }

  // Solo aceptamos estos dos valores
  const allowed = new Set(["ACTIVATE", "DEACTIVATE"]);
  if (!allowed.has(newStatus)) {
    return { errors: [{ message: `Estado no soportado: ${newStatus}` }] };
  }

  // El campo 'active' en tu definición es boolean → mandamos "true"/"false" (string)
  const value = newStatus === "ACTIVATE" ? "true" : "false";

  const resp = await graphql(METAOBJECT_UPDATE, {
    variables: {
      id,
      metaobject: {
        fields: [
          { key: "active", value },
        ],
      },
    },
  });
  const json = await resp.json();

  // Si la variable tuviera mal shape, Shopify lanza este error y el cliente tira excepción.
  // Si pasó la validación, cualquier problema vendrá como userErrors:
  const errs = json?.data?.metaobjectUpdate?.userErrors || [];
  if (errs.length) return { errors: errs };

  const metaobject = json?.data?.metaobjectUpdate?.metaobject;
  if (!metaobject) return { errors: [{ message: "No se pudo actualizar el estado" }] };

  return { success: true, metaobject };
}
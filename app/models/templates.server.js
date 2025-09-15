import { factory } from "typescript";
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
    name: n.name || null,
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
                price
                inventoryQuantity
                v_mfpermite: metafield(namespace: "upng", key: "permite_pedidos") { value }
                ${variantBlock}
              }
            }
          }
        }
      }
    }
  `;

  // Mapas alias -> "ns.key"
  // const prodAlias = new Map(
  //   prodDefs.map((d, i) => [`p_mf${i}`, `${d.namespace}.${d.key}`])
  // );
  // const varAlias = new Map(
  //   varDefs.map((d, i) => [`v_mf${i}`, `${d.namespace}.${d.key}`])
  // );

  // return { query, prodAlias, varAlias, pageSize };
    const prodAliasInfo = new Map(prodDefs.map((d, i) => [
    `p_mf${i}`,
    { defId: d.id, ns: d.namespace, key: d.key, scope: "PRODUCT", name: d.name }
  ]));
  const varAliasInfo = new Map(varDefs.map((d, i) => [
    `v_mf${i}`,
    { defId: d.id, ns: d.namespace, key: d.key, scope: "PRODUCTVARIANT", name: d.name }
  ]));

  return { query, prodAliasInfo, varAliasInfo, pageSize };
}

/**
 * Calcula el mapa { "ns.key": ["v1","v2", ...] } trayendo SOLO los metafields
 * seleccionados en la template (product + variant), usando la query con aliases.
 */
async function computeCollectionFiltersMapSelected(
  graphql,
  collectionId,
  prodDefs,
  varDefs,
  opts = { includeVendor: true, includeAvailability: true, includePrice: true },
  order = [],
  labels = {}
) {

   const asMoneyNumber = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    if (typeof v === "object" && v.amount != null) return Number(v.amount);
    return null;
  };


  const normalizedOrder = asArr(order).map(normalizeIdToDef);
  const hasProd = asArr(prodDefs).length > 0;
  const hasVar = asArr(varDefs).length > 0;
  if (!hasProd && !hasVar && !opts.includeVendor && !opts.includeAvailability && !opts.includePrice) return [];

  const { query, prodAliasInfo, varAliasInfo, pageSize } = buildSelectedMfQuery(
    prodDefs.map(d => ({ id: d.id, namespace: d.namespace, key: d.key, name: d.name })),
    varDefs.map(d => ({ id: d.id, namespace: d.namespace, key: d.key, name: d.name })),
    50
  );

  // acc: Map<filterId, entry>
  const acc = new Map();
  let globalMaxOfProductMinPrices = null;

  // helpers para crear filtro si no existe
  const ensureFilter = (filterId, { label, namespace, key, type, param_name }) => {
    if (!acc.has(filterId)) {
      acc.set(filterId, {
        _id: filterId,  // ← para ordenar luego
        filter: {
          label,
          namespace,
          key,
          type,
          param_name,
          values: new Map(), // luego lo convertimos a array ordenado
        },
      });
    }
    return acc.get(filterId);
  };

  // Estáticos
  if (opts.includeVendor) {
    ensureFilter("static:vendor", {
      label: labels["static:vendor"]?.trim() || "Marca",
      namespace: null,
      key: "vendor",
      type: "vendor",
      param_name: "filter.p.vendor",
    });
  }
  if (opts.includeAvailability) {
    ensureFilter("static:availability", {
      label: labels["static:availability"]?.trim() || "Disponibilidad",
      namespace: null,
      key: "availability",
      type: "availability",
      param_name: "filter.v.availability",
    });
  }
  if (opts.includePrice) {
    ensureFilter("static:price", {
      label: labels["static:price"]?.trim() || "Precio",
      namespace: null,
      key: "price",
      type: "price",
      param_name: "filter.v.price",
    });
  }

  // push de valores en mapas
  const pushValue = (entry, value) => {
    const trimmedVal = String(value || "").trim();
    if (!trimmedVal) return;
    if (!entry.filter.values.has(trimmedVal)) {
      entry.filter.values.set(trimmedVal, {
        id: entry.filter.param_name, // o el id de metafield si lo necesitas por valor
        value: trimmedVal,
        label: trimmedVal,
        count: 1,
        active: false,
        param_name: entry.filter.param_name,
      });
    } else {
      entry.filter.values.get(trimmedVal).count += 1;
    }
  };

  let after = null;
  do {
    const resp = await graphql(query, { variables: { collectionId, first: pageSize, after } });
    const json = await resp.json();
    const products = json?.data?.collection?.products;
    const pageInfo = products?.pageInfo || {};
    after = pageInfo?.hasNextPage ? pageInfo.endCursor : null;

    for (const p of asArr(products?.nodes)) {
      let productMinVariantPrice = null;
      // PRODUCT metafields por alias
      for (const [alias, info] of prodAliasInfo) {
        const mf = p?.[alias];
        if (mf && mf.value != null) {
          const filterId = `mfdef:${info.defId}`;
          const labelBase = info.name || `${mf.namespace}.${mf.key}`;
          const labelOver = getLabelOverride(filterId, labels);
          const entry = ensureFilter(filterId, {
            label: labelOver || labelBase,
            namespace: mf.namespace,
            key: mf.key,
            type: mf.type,
            param_name: `filter.p.${mf.namespace}.${mf.key}`,
          });
          for (const val of explodeValue(mf)) pushValue(entry, val);
        }
      }

      // VARIANT metafields por alias
      const variants = asArr(p?.variants?.nodes);
      for (const v of variants) {
        const n = asMoneyNumber(v?.price);
        if (n != null && !Number.isNaN(n)) {
          productMinVariantPrice = (productMinVariantPrice == null) ? n : Math.min(productMinVariantPrice, n);
        }
        for (const [alias, info] of varAliasInfo) {
          const mf = v?.[alias];
          if (mf && mf.value != null) {
            const filterId = `mfdef:${info.defId}`;
            const labelBase = info.name || `${mf.namespace}.${mf.key}`;
            const labelOver = getLabelOverride(filterId, labels);
            const entry = ensureFilter(filterId, {
              label: labelOver || labelBase,
              namespace: mf.namespace,
              key: mf.key,
              type: mf.type,
              param_name: `filter.v.${mf.namespace}.${mf.key}`,
            });
            for (const val of explodeValue(mf)) pushValue(entry, val);
          }
        }
      }
      
      // Actualiza el global con el mínimo de este producto
      if (productMinVariantPrice != null) {
        globalMaxOfProductMinPrices =
          (globalMaxOfProductMinPrices == null)
            ? productMinVariantPrice
            : Math.max(globalMaxOfProductMinPrices, productMinVariantPrice);
      }

      // Vendor
      if (opts.includeVendor) {
        const vendor = String(p?.vendor || "").trim();
        if (vendor) pushValue(acc.get("static:vendor"), vendor);
      }

      // Availability
      if (opts.includeAvailability) {
        const hasStock = variants.some(v => Number(v?.inventoryQuantity || 0) > 0);
        pushValue(acc.get("static:availability"), hasStock ? "available" : "unavailable");
      }

      // Price (si quieres seguir guardando rangos, aquí podrías calcular min/max)
    }
  } while (after);

  // 👉 Inyecta el valor especial "max-price" en el filtro de precio
  if (opts.includePrice) {
    const priceEntry = acc.get("static:price");
    if (priceEntry) {
      const maxPrice = globalMaxOfProductMinPrices ?? 0;
      // guardamos 'max-price' como value y el número en label
      priceEntry.filter.values.set("max-price", {
        id: priceEntry.filter.param_name,
        value: "max-price",
        label: String(maxPrice),
        count: 1,
        active: false,
        param_name: priceEntry.filter.param_name,
      });
    }
  }

  // Convertimos los mapas de values a arrays ordenados alfabéticamente (local es)
  const toSortedArray = (map) =>
    uniqSorted([...map.keys()]).map(val => map.get(val));

  const all = [...acc.values()].map(e => ({
    filter: {
      ...e.filter,
      // APLICA label override final por si cambia antes de escribir
      label: getLabelOverride(e._id, labels) || e.filter.label,
      values: toSortedArray(e.filter.values),
    },
    _id: e._id, // mantenemos para ordenar y luego lo quitamos
  }));

  // Orden final:
  // - Primero los ids presentes en `order` en ese orden
  // - Luego el resto (los que no estaban en order), en su orden actual
  const byId = new Map(all.map(x => [x._id, x]));
  const ordered = [];
  const seen = new Set();

  for (const id of normalizedOrder) {
    const x = byId.get(id);
    if (x) { ordered.push(x); seen.add(id); }
  }
  for (const x of all) {
    if (!seen.has(x._id)) ordered.push(x);
  }

  // Limpia el _id antes de devolver
  return ordered.map(({ _id, ...rest }) => rest);
}



// Escribe el JSON en el metafield de la colección
async function writeCollectionFiltersJson(graphql, collectionId, filtersArray) {
  const resp = await graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: collectionId,
          namespace: COLLECTION_FILTERS_NS,
          key: COLLECTION_FILTERS_KEY,
          type: "json",
          value: JSON.stringify(filtersArray || []),
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

function mapDefsToOptions(defs, scope) {
  return (defs ?? []).map((d) => ({
    value: d.id,
    label: `${d.name} — ${d.namespace}.${d.key}`,
    nameMF: d.name,
    source: `${d.namespace}.${d.key}`,
    namespace: d.namespace,
    key: d.key,
    scope
  }));
}

function buildSectionedOptions(productDefs, variantDefs) {
  return [
    { title: "Product", options: mapDefsToOptions(productDefs, "P") },
    { title: "Variant", options: mapDefsToOptions(variantDefs, "V") },
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
      { key: "include_vendor", name: "Include vendor", type: "boolean" },
      { key: "include_availability", name: "Include availability", type: "boolean" },
      { key: "include_price", name: "Include price", type: "boolean" },
      { key: "filters_order", name: "Filters order", type: "json" },
      { key: "filters_labels", name: "Filters labels", type: "json" },
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
  // 1) Campos base
  let filtersIds = [];
  try {
    filtersIds = JSON.parse(node?.filters?.value ?? "[]");
  } catch {}

  // 2) NUEVOS: declara SIEMPRE antes de usarlos
  let filtersOrder = [];
  try {
    filtersOrder = JSON.parse(node?.filters_order?.value ?? "[]");
  } catch {}

  let filtersLabels = {};
  try {
    filtersLabels = JSON.parse(node?.filters_labels?.value ?? "{}");
  } catch {}



  // 3) Colecciones
  const collections =
    node?.collections?.references?.nodes?.map((c) => ({
      id: c.id,
      title: c.title,
      handle: c.handle,
    })) ?? [];

    const includeVendor = node?.include_vendor ? toBool(node.include_vendor.value) : false;
    const includeAvailability =  node?.include_availability ? toBool(node.include_availability.value) : false;
    const includePrice =  node?.include_price ? toBool(node.include_price.value) : false;

  // 4) Return normalizado
  return {
    id: node.id,
    handle: node.handle,
    title: node?.title?.value ?? null,
    active: toBool(node?.active?.value),
    filtersIds,
    filtersOrder,
    filtersLabels,
    collections,
    includeVendor,
    includeAvailability,
    includePrice,
  };
}


const toMetaobjectGid = (maybeId) => {
  const s = String(maybeId ?? '');
  if (!s) return s;
  if (s === '0') return s; // sentinel de "crear"
  return s.startsWith('gid://shopify/Metaobject/') ? s : `gid://shopify/Metaobject/${s}`;
};

const normalizeIdToDef = (id) =>
  typeof id === "string" && id.startsWith("mf:")
    ? id.replace("mf:", "mfdef:")
    : id;

const getLabelOverride = (filterId, labels) => {
  if (!labels) return "";
  if (labels[filterId]?.trim()) return labels[filterId].trim();
  if (filterId.startsWith("mfdef:")) {
    const alt = "mf:" + filterId.slice("mfdef:".length);
    if (labels[alt]?.trim()) return labels[alt].trim();
  }
  return "";
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
    const normalizedNode = normalizeNode(node);
    return node ? [normalizedNode] : [];
  }

  const q = await graphql(LIST_TEMPLATES, { variables: { first, after } });
  const jq = await q.json();
  const edges = jq?.data?.metaobjects?.edges || [];
  const result = edges.map(({ node }) => normalizeNode(node));
  return result;
}

export async function saveTemplate(graphql, id, templateJSONString) {
  const gid = toMetaobjectGid(id);

  const template = JSON.parse(templateJSONString || "{}");

  const {
    title = "",
    collectionIds = [], // GIDs de Collection
    filtersIds = [], // GIDs de MetafieldDefinition
    active = true,
    includeVendor = true,
    includeAvailability = true,
    includePrice = true,
    filtersOrder = [],
    filtersLabels = {},
  } = template;

  await ensureTemplateDefinition(graphql);

  // --- upsert/update del metaobjeto (tal como tenías) ---
  const fields = [
    { key: "title", value: String(title) },
    { key: "collections", value: JSON.stringify(collectionIds) },
    { key: "filters", value: JSON.stringify(filtersIds) },
    { key: "active", value: String(!!active) },
    { key: "include_vendor", value: String(!!includeVendor) },
    { key: "include_availability", value: String(!!includeAvailability) },
    { key: "include_price", value: String(!!includePrice) },
    { key: "filters_order", value: JSON.stringify(filtersOrder || []) },
    { key: "filters_labels", value: JSON.stringify(filtersLabels || {}) },
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
    if (
      prodDefs.length === 0 &&
      varDefs.length === 0 &&
      !includeVendor &&
      !includeAvailability &&
      !includePrice
    ) {
      await writeCollectionFiltersJson(graphql, collId, {});
      continue;
    }

    // Usar versión "selected" (solo metafields de template)
  const filtersArray = await computeCollectionFiltersMapSelected(
    graphql,
    collId,
    prodDefs,
    varDefs,
    { includeVendor, includeAvailability, includePrice },
    filtersOrder || [],
    filtersLabels || {}
  );

  await writeCollectionFiltersJson(graphql, collId, filtersArray);
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
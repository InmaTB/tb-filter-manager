import { GET_FILTER_BY_COLLECTION } from "../graphql/collections";
import { unauthenticated } from "../shopify.server";

// ============================
// Config & helpers base
// ============================
const DEFAULT_PER_PAGE = 16;
const SCAN_PAGE_SIZE   = 250;    // lectura por página en modo filtered
const FACETS_PAGE_SIZE = 250;    // lectura por página para facetas globales
const FACETS_MAX_PAGES = 40;     // ~4.000 productos máx. para facetas

function clampInt(val, min, max) {
  const n = parseInt(val, 10);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return min;
}

function parsePaging(input) {
  const params  = (input instanceof URLSearchParams) ? input : new URLSearchParams(input || {});
  const perPage = clampInt(params.get('per_page') ?? DEFAULT_PER_PAGE, 1, 100);
  const page    = clampInt(params.get('page') ?? 1, 1, 999999);
  const after   = params.get('after') || null;
  return { perPage, page, after };
}

const SORT_WHITELIST = new Set([
  'manual',
  'best-selling',
  'title-ascending',
  'title-descending',
  'price-ascending',
  'price-descending',
  'created-ascending',
  'created-descending',
]);

function parseSortBy(params) {
  const raw = params.get('sort_by') || 'manual';
  const val = SORT_WHITELIST.has(raw) ? raw : 'manual';
  switch (val) {
    case 'manual':             return { sortKey: 'COLLECTION_DEFAULT', reverse: false };
    case 'best-selling':       return { sortKey: 'BEST_SELLING',       reverse: false };
    case 'title-ascending':    return { sortKey: 'TITLE',              reverse: false };
    case 'title-descending':   return { sortKey: 'TITLE',              reverse: true  };
    case 'price-ascending':    return { sortKey: 'PRICE',              reverse: false };
    case 'price-descending':   return { sortKey: 'PRICE',              reverse: true  };
    case 'created-ascending':  return { sortKey: 'CREATED',            reverse: false };
    case 'created-descending': return { sortKey: 'CREATED',            reverse: true  };
    default:                   return { sortKey: 'COLLECTION_DEFAULT', reverse: false };
  }
}

// ============================
// Query builder + paging fetch
// ============================
function metafieldFragment(metafieldsArray) {
  if (!metafieldsArray.length) return "";
  const unique = new Set(metafieldsArray.map(({ namespace, key }) => `${namespace}___${key}`));
  return [...unique].map((entry, i) => {
    const [namespace, key] = entry.split("___");
    return `mf_${i}: metafield(namespace: "${namespace}", key: "${key}") { value namespace key }`;
  }).join("\n");
}

function buildCollectionQuery(
  country,
  language,
  collectionId,
  productMetafields,
  variantMetafields,
  sortKey = 'COLLECTION_DEFAULT',
  reverse = false,
  first = DEFAULT_PER_PAGE,
  after = null
) {
  const productMetafieldsFragment = metafieldFragment(productMetafields);
  const variantMetafieldsFragment = metafieldFragment(variantMetafields);

  const inContext = `@inContext(language: ${language}, country: ${country})`;
  const afterArg  = after ? `, after: "${after}"` : '';
  const args      = `first: ${first}, sortKey: ${sortKey}, reverse: ${reverse}${afterArg}`;

  return `#graphql
    query CollectionProducts ${inContext}  {
      collection(id: "gid://shopify/Collection/${collectionId}") {
        products(${args}) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          nodes {
            id
            title
            handle
            vendor
            url: onlineStoreUrl
            priceRange {
              maxVariantPrice { amount }
              minVariantPrice { amount }
            }
            ${productMetafieldsFragment}
            variants(first: 100) {
              nodes {
                id
                price: priceV2 { amount }   # para precisión en filtro de rango gte+lte
                ${variantMetafieldsFragment}
                quantityAvailable
                v_mfpermite: metafield(namespace: "upng", key: "permite_pedidos") { value }
              }
            }
          }
        }
      }
    }
  `;
}

function unpackProducts(resultJson) {
  const nodes    = resultJson?.data?.collection?.products?.nodes ?? [];
  const pageInfo = resultJson?.data?.collection?.products?.pageInfo ?? {};
  return { nodes, pageInfo };
}

async function fetchCollectionPage({ storefront, args }) {
  const {
    country, language, collectionId,
    productMetafields, variantMetafields,
    sortKey, reverse, first, after
  } = args;

  const q = buildCollectionQuery(
    country, language, collectionId,
    productMetafields, variantMetafields,
    sortKey, reverse,
    first, after
  );
  const res  = await storefront.graphql(q);
  const json = await res.json();
  return unpackProducts(json);
}

async function scanUntil({ storefront, baseArgs, maxPages = 20, onBatch }) {
  let after = baseArgs.after ?? null;
  for (let i = 0; i < maxPages; i++) {
    const { nodes, pageInfo } = await fetchCollectionPage({
      storefront,
      args: { ...baseArgs, after }
    });
    const res = await onBatch(nodes, pageInfo);
    if (res?.done) return res.payload ?? null;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
  }
  return null;
}

// ============================
// Filtros: extracción y matching
// ============================
function getOriginalFilters(tbOriginalFilters) {
  const productMetafields = new Set();
  const variantMetafields = new Set();

  for (const wrapper of tbOriginalFilters) {
    const filter = wrapper.filter;
    const paramName = filter.param_name || "";
    let cleanParamName = paramName.startsWith("filter.") ? paramName.slice(7) : paramName;
    const parts = cleanParamName.split('.');

    if (parts.length >= 3) {
      const [type, namespace, key] = parts;
      if (type === 'p') productMetafields.add(JSON.stringify({ namespace, key }));
      if (type === 'v') variantMetafields.add(JSON.stringify({ namespace, key }));
    }
  }

  return {
    productMetafields: Array.from(productMetafields).map(str => JSON.parse(str)),
    variantMetafields: Array.from(variantMetafields).map(str => JSON.parse(str)),
  };
}

function classifyFilters(params) {
  const productMetafields = new Set();
  const variantMetafields = new Set();
  const nativeFilters = { vendor: null, availability: null, price: {} };

  for (const [key, value] of params.entries()) {
    if (key.startsWith('filter.p.') && key.split('.').length === 4) {
      const [, , namespace, mfKey] = key.split('.');
      productMetafields.add({ namespace, key: mfKey });

    } else if (key.startsWith('filter.v.') && key.split('.').length === 4) {
      const [, , namespace, mfKey] = key.split('.');
      variantMetafields.add({ namespace, key: mfKey });

    } else if (key === 'filter.p.vendor') {
      nativeFilters.vendor = value;

    } else if (key === 'filter.v.availability') {
      nativeFilters.availability = value === 'available';

    } else if (key === 'filter.v.price_gte') {
      nativeFilters.price.gte = value ? parseFloat(value) : undefined;

    } else if (key === 'filter.v.price_lte') {
      nativeFilters.price.lte = value ? parseFloat(value) : undefined;
    }
  }

  return {
    productMetafields: Array.from(productMetafields),
    variantMetafields: Array.from(variantMetafields),
    nativeFilters,
  };
}

function extractExpectedMetafields(params) {
  const expectedProductMetafields = [];
  const expectedVariantMetafields = [];

  for (const [key, value] of params.entries()) {
    if (!key.startsWith('filter.')) continue;
    const parts = key.split('.');

    if (parts[0] === 'filter' && parts[1] === 'p') {
      if (parts.length === 4) {
        const [, , namespace, mfKey] = parts;
        expectedProductMetafields.push({ namespace, key: mfKey, values: [value].flat() });
      }
      continue;
    }

    if (parts[0] === 'filter' && parts[1] === 'v') {
      if (parts.length === 4) {
        const [, , namespace, mfKey] = parts;
        if (namespace !== 'price' && namespace !== 'availability') {
          expectedVariantMetafields.push({ namespace, key: mfKey, values: [value].flat() });
        }
      }
    }
  }

  return { expectedProductMetafields, expectedVariantMetafields };
}

function explodeValue(mf) {
  if (!mf || mf.value == null) return [];
  const raw = mf.value;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch (_) {}
  return String(raw)
    .split(/[\|,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function extractMetafieldsFromObject(obj) {
  return Object.entries(obj)
    .filter(([k]) => k.startsWith('mf_'))
    .map(([, v]) => v);
}

function metafieldMatches(metafieldsObjOrArray = {}, expected = []) {
  const metafieldsArray = Array.isArray(metafieldsObjOrArray)
    ? metafieldsObjOrArray
    : Object.values(metafieldsObjOrArray);
  if (!metafieldsArray.length) return false;

  const grouped = expected.reduce((acc, { namespace, key, values }) => {
    const k = `${namespace}.${key}`;
    if (!acc[k]) acc[k] = { namespace, key, values: new Set(values.map(String)) };
    else values.forEach(v => acc[k].values.add(String(v)));
    return acc;
  }, {});

  return Object.values(grouped).every(({ namespace, key, values }) => {
    return metafieldsArray.some((mf) => {
      if (mf?.namespace !== namespace || mf?.key !== key) return false;
      const vals = explodeValue(mf).map(String);
      return vals.some(v => values.has(v));
    });
  });
}

function collectMfAliases(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .filter(([k]) => k.startsWith('mf_'))
    .map(([, mf]) => mf)
    .filter(Boolean);
}

function isVariantAvailable(variant) {
  const raw = variant?.v_mfpermite?.value;
  const permitePedidos =
    typeof raw === 'string'
      ? (raw.toLowerCase() === 'true' || raw === '1')
      : Boolean(raw);

  const qty = Number(variant?.quantityAvailable ?? 0);
  return qty > 0 || permitePedidos;
}

/** Helper: precio de variante o fallback al rango de producto */
function getVariantPriceOrFallback(variant, product) {
  const v = parseFloat(variant?.price?.amount ?? 'NaN');
  if (Number.isFinite(v)) return v;
  const pMin = parseFloat(product?.priceRange?.minVariantPrice?.amount ?? 'NaN');
  const pMax = parseFloat(product?.priceRange?.maxVariantPrice?.amount ?? 'NaN');
  if (Number.isFinite(pMin)) return pMin;
  if (Number.isFinite(pMax)) return pMax;
  return NaN;
}

// ============================
// Facetas (self-exclusion) & helpers relacionados
// ============================
function groupExpectedByKey(expectedArr) {
  const map = new Map();
  for (const e of expectedArr || []) {
    const k = `${e.namespace}.${e.key}`;
    if (!map.has(k)) map.set(k, new Set());
    for (const v of e.values || []) map.get(k).add(String(v));
  }
  return map;
}

function deriveFacets(tbOriginalFilters) {
  const facets = [];
  for (const w of tbOriginalFilters || []) {
    const f = w?.filter || {};
    const param = String(f.param_name || '');
    if (!param.startsWith('filter.')) continue;
    const parts = param.slice(7).split('.'); // p.ns.key / v.ns.key / p.vendor / v.availability
    if (parts[0] === 'p' && parts[1] === 'vendor') {
      facets.push({ scope: 'vendor', namespace: null, key: 'vendor', param });
    } else if (parts[0] === 'v' && parts[1] === 'availability') {
      facets.push({ scope: 'availability', namespace: null, key: 'availability', param });
    } else if (parts.length === 3 && (parts[0] === 'p' || parts[0] === 'v')) {
      facets.push({ scope: parts[0], namespace: parts[1], key: parts[2], param });
    }
  }
  return facets;
}

function variantMatchesOtherConstraints(variant, product, evsMap, nativeFilters, opts = {}) {
  const { ignoreAvailability = false } = opts;

  // 1) Metacampos de variante (otros)
  if (evsMap && evsMap.size) {
    const vMfs = collectMfAliases(variant);
    for (const [k, valuesSet] of evsMap.entries()) {
      const [ns, key] = k.split('.');
      const hasAny = vMfs.some(mf => mf?.namespace === ns && mf?.key === key && valuesSet.has(String(mf.value)));
      if (!hasAny) return false;
    }
  }

  // 2) Disponibilidad
  if (!ignoreAvailability && nativeFilters?.availability !== null) {
    const ok = nativeFilters.availability ? isVariantAvailable(variant) : !isVariantAvailable(variant);
    if (!ok) return false;
  }

  // 3) Precio (si está activo)
  const gteActive = Number.isFinite(nativeFilters?.price?.gte);
  const lteActive = Number.isFinite(nativeFilters?.price?.lte);
  if (gteActive || lteActive) {
    const gte = gteActive ? nativeFilters.price.gte : -Infinity;
    const lte = lteActive ? nativeFilters.price.lte : Infinity;
    const price = getVariantPriceOrFallback(variant, product);
    const priceOK = (price >= gte) && (price <= lte);
    if (!priceOK) return false;
  }

  return true;
}

function productMatchesProductMfs(product, epsMap) {
  if (!epsMap || !epsMap.size) return true;
  const pMfs = collectMfAliases(product);
  for (const [k, valuesSet] of epsMap.entries()) {
    const [ns, key] = k.split('.');
    const hasAny = pMfs.some(mf => mf?.namespace === ns && mf?.key === key && valuesSet.has(String(mf.value)));
    if (!hasAny) return false;
  }
  return true;
}

/**
 * getAvailableFilterValuesSimple:
 *   Versión simple (no self-exclusion) que recorre un array de productos y
 *   agrega valores presentes. Útil por página o para UI rápida.
 */
function getAvailableFilterValuesSimple(filteredProducts) {
  const available = {};

  for (const product of filteredProducts || []) {
    // Metafields de producto
    for (const mf of collectMfAliases(product)) {
      const key = `p.${mf.namespace}.${mf.key}`;
      if (!available[key]) available[key] = new Set();
      for (const val of explodeValue(mf)) available[key].add(val);
    }

    // Vendor
    if (!available["p.vendor"]) available["p.vendor"] = new Set();
    if (product.vendor) available["p.vendor"].add(product.vendor);

    // Variantes
    for (const variant of product?.variants?.nodes || []) {
      for (const mf of collectMfAliases(variant)) {
        const key = `v.${mf.namespace}.${mf.key}`;
        if (!available[key]) available[key] = new Set();
        for (const val of explodeValue(mf)) available[key].add(val);
      }

      // Disponibilidad
      if (!available["v.availability"]) available["v.availability"] = new Set();
      available["v.availability"].add(isVariantAvailable(variant) ? "available" : "unavailable");
    }
  }

  // Sets -> arrays
  const out = {};
  for (const k in available) out[k] = [...available[k]];
  return out;
}

/**
 * getAvailableFilterValues (SELF-EXCLUSION):
 *   Calcula, para cada faceta, los valores que seguirían dando resultados
 *   aplicando todas las selecciones actuales EXCEPTO la de esa faceta.
 */
function getAvailableFilterValues(productsAll, expectedProductMetafields, expectedVariantMetafields, nativeFilters, tbOriginalFilters) {
  const facets = deriveFacets(tbOriginalFilters);
  const epsFull = groupExpectedByKey(expectedProductMetafields);
  const evsFull = groupExpectedByKey(expectedVariantMetafields);

  const out = {};

  for (const facet of facets) {
    const epsMap = new Map(epsFull);
    const evsMap = new Map(evsFull);
    let ignoreVendor = false;
    let ignoreAvailability = false;

    if (facet.scope === 'p') {
      epsMap.delete(`${facet.namespace}.${facet.key}`);
    } else if (facet.scope === 'v') {
      evsMap.delete(`${facet.namespace}.${facet.key}`);
    } else if (facet.scope === 'vendor') {
      ignoreVendor = true;
    } else if (facet.scope === 'availability') {
      ignoreAvailability = true;
    }

    const acc = new Set();

    for (const product of productsAll || []) {
      if (!ignoreVendor && nativeFilters?.vendor && product?.vendor !== nativeFilters.vendor) continue;
      if (!productMatchesProductMfs(product, epsMap)) continue;

      const variants = product?.variants?.nodes || [];
      const hasVariantOtherOK =
        evsMap.size || nativeFilters?.availability !== null || Number.isFinite(nativeFilters?.price?.gte) || Number.isFinite(nativeFilters?.price?.lte)
          ? variants.some(v => variantMatchesOtherConstraints(v, product, evsMap, nativeFilters, { ignoreAvailability }))
          : true;

      if (!hasVariantOtherOK) continue;

      if (facet.scope === 'vendor') {
        if (product.vendor) acc.add(String(product.vendor));
      } else if (facet.scope === 'availability') {
        for (const v of variants) {
          if (!variantMatchesOtherConstraints(v, product, evsMap, nativeFilters, { ignoreAvailability: true })) continue;
          acc.add(isVariantAvailable(v) ? "available" : "unavailable");
        }
      } else if (facet.scope === 'p') {
        const pMfs = collectMfAliases(product);
        for (const mf of pMfs) {
          if (mf?.namespace === facet.namespace && mf?.key === facet.key) {
            for (const val of explodeValue(mf)) acc.add(String(val));
          }
        }
      } else if (facet.scope === 'v') {
        for (const v of variants) {
          if (!variantMatchesOtherConstraints(v, product, evsMap, nativeFilters, { ignoreAvailability })) continue;
          const vMfs = collectMfAliases(v);
          for (const mf of vMfs) {
            if (mf?.namespace === facet.namespace && mf?.key === facet.key) {
              for (const val of explodeValue(mf)) acc.add(String(val));
            }
          }
        }
      }
    }

    const outKey =
      facet.scope === 'vendor' ? 'p.vendor' :
      facet.scope === 'availability' ? 'v.availability' :
      `${facet.scope}.${facet.namespace}.${facet.key}`;

    out[outKey] = [...acc];
  }

  return out;
}

function getDisabledFilters(tbOriginalFilters, availableFilterValues) {
  const disabledCheckboxes = [];
  for (const wrapper of tbOriginalFilters || []) {
    const filter = wrapper.filter || {};
    for (const value of (filter.values || [])) {
      const paramName = value.param_name;
      const val       = value.value;
      const key = getAvailableKeyFromParamName(paramName);
      const availableValues = availableFilterValues[key] || [];
      if (!availableValues.includes(val)) {
        disabledCheckboxes.push({ paramName, value: val });
      }
    }
  }
  return disabledCheckboxes;
}

function getAvailableKeyFromParamName(paramName) {
  if (paramName.startsWith("filter.")) return paramName.slice(7);
  return paramName;
}

async function computeAvailableFiltersValuesGlobal({
  storefront,
  country, language, collectionId,
  productMetafields, variantMetafields,
  sortKey, reverse,
  expectedProductMetafields, expectedVariantMetafields, nativeFilters,
  tbOriginalFilters,
  pageSize = FACETS_PAGE_SIZE,
  maxPages = FACETS_MAX_PAGES
}) {
  let after = null;
  let pages = 0;
  const acc = {};

  while (pages < maxPages) {
    const { nodes, pageInfo } = await fetchCollectionPage({
      storefront,
      args: {
        country, language, collectionId,
        productMetafields,          // de config (todas las facetas)
        variantMetafields,
        sortKey, reverse,
        first: pageSize,
        after
      }
    });

    const partial = getAvailableFilterValues(
      nodes,
      expectedProductMetafields,
      expectedVariantMetafields,
      nativeFilters,
      tbOriginalFilters
    );

    // merge
    for (const [k, arr] of Object.entries(partial || {})) {
      if (!acc[k]) acc[k] = new Set();
      for (const v of arr) acc[k].add(String(v));
    }

    pages++;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
  }

  const out = {};
  for (const k in acc) out[k] = [...acc[k]];
  return out;
}


// ============================
// Entry point
// ============================
export async function filterCollection(shop, country, language, collectionId, params) {
  const { storefront } = await unauthenticated.storefront(shop);
  const { admin }      = await unauthenticated.admin(shop);

  // 1) Config de filtros (metaobjeto)
  let tbOriginalFilters = [];
  try {
    const response = await admin.graphql(GET_FILTER_BY_COLLECTION, {
      variables: { collectionId: `gid://shopify/Collection/${collectionId}` }
    });
    const result = await response.json();
    tbOriginalFilters = result?.data?.collection?.metafield?.jsonValue ?? [];
  } catch (error) {
    console.error('Error en query GET_FILTER_BY_COLLECTION:', error);
  }

  // 2) Metafields configurados
  const { productMetafields, variantMetafields } = getOriginalFilters(tbOriginalFilters);

  // 3) Filtros activos
  const {
    productMetafields: activeProductMetafields,
    variantMetafields: activeVariantMetafields,
    nativeFilters
  } = classifyFilters(params);

  // 4) Expected (clave + valores)
  const {
    expectedProductMetafields,
    expectedVariantMetafields
  } = extractExpectedMetafields(params);

  // 5) Orden y paginación
  const { sortKey, reverse }   = parseSortBy(params);
  const { perPage, page, after } = parsePaging(params);

  // 6) ¿hay filtros activos?
  const hasProductMetas = expectedProductMetafields.length > 0;
  const hasVariantMetas = expectedVariantMetafields.length > 0;
  const hasVendor       = nativeFilters.vendor !== null;
  const hasAvail        = nativeFilters.availability !== null;
  const hasPrice        =
    Number.isFinite(nativeFilters?.price?.gte) ||
    Number.isFinite(nativeFilters?.price?.lte);
  const hasAnyFilter    = hasProductMetas || hasVariantMetas || hasVendor || hasAvail || hasPrice;

  // 7) Página base SIN filtros (para modo native)
  let baseNodes = [];
  let basePageInfo = {};
  try {
    const base = await fetchCollectionPage({
      storefront,
      args: {
        country, language, collectionId,
        productMetafields, variantMetafields,
        sortKey, reverse,
        first: perPage,
        after
      }
    });
    baseNodes    = base.nodes;
    basePageInfo = base.pageInfo;
  } catch (e) {
    console.error('Error en query base:', e);
  }

  // --- MODO NATIVE: sin filtros activos
  if (!hasAnyFilter) {
    const handles = baseNodes.map(p => p.handle);
    return {
      mode: 'native',
      handles,
      pageInfo: basePageInfo,
      per_page: perPage,
    };
  }

  // --- MODO FILTERED: escanear y paginar tras filtrar (ventana optimizada)
  const startIndex  = (page - 1) * perPage;
  const windowSize  = perPage + 1; // +1 para saber si hay siguiente página filtrada
  const filteredHandles = [];

  let skipped   = 0; // elementos filtrados saltados antes de la ventana
  let collected = 0; // elementos añadidos a la ventana

  // Pedimos solo los metafields necesarios para evaluar filtros activos.
  const needsProductMfs = hasProductMetas;
  const needsVariantMfs = hasVariantMetas;

  await scanUntil({
    storefront,
    baseArgs: {
      country, language, collectionId,
      productMetafields: needsProductMfs ? activeProductMetafields : [],
      variantMetafields: needsVariantMfs ? activeVariantMetafields : [],
      sortKey, reverse,
      first: SCAN_PAGE_SIZE,
      after: null
    },
    maxPages: 50,
    onBatch: (nodes, pageInfo) => {
      const batchFiltered = nodes.filter((product) => {
        const productMetafieldsArray = extractMetafieldsFromObject(product);
        const productOK = hasProductMetas
          ? metafieldMatches(productMetafieldsArray, expectedProductMetafields)
          : true;

        let variantOK;
        if (hasAvail && nativeFilters.availability === false) {
          // caso especial: "unavailable": todas las variantes deben NO estar disponibles
          variantOK = product.variants.nodes.every(v => !isVariantAvailable(v));
        } else {
          variantOK = product.variants.nodes.some((variant) => {
            const variantMetafieldsArray = extractMetafieldsFromObject(variant);
            const variantMetafieldsOK = hasVariantMetas
              ? metafieldMatches(variantMetafieldsArray, expectedVariantMetafields)
              : true;

            const availabilityOK = hasAvail
              ? (nativeFilters.availability ? isVariantAvailable(variant) : true)
              : true;

            // precio con helper
            const gteActive = Number.isFinite(nativeFilters?.price?.gte);
            const lteActive = Number.isFinite(nativeFilters?.price?.lte);
            let priceOK = true;
            if (gteActive || lteActive) {
              const gte = gteActive ? nativeFilters.price.gte : -Infinity;
              const lte = lteActive ? nativeFilters.price.lte : Infinity;
              const price = getVariantPriceOrFallback(variant, product);
              priceOK = (price >= gte) && (price <= lte);
            }

            return variantMetafieldsOK && availabilityOK && priceOK;
          });
        }

        const vendorOK = hasVendor ? product.vendor === nativeFilters.vendor : true;
        return productOK && variantOK && vendorOK;
      });

      for (const p of batchFiltered) {
        if (skipped < startIndex) {
          skipped++;
          continue;
        }
        if (collected < windowSize) {
          filteredHandles.push(p.handle);
          collected++;
        } else {
          break;
        }
      }

      if (collected >= windowSize) return { done: true };
      if (!pageInfo?.hasNextPage)  return { done: true };
      return { done: false };
    }
  });

  const pageSlice = filteredHandles.slice(0, perPage);

  // Facetas globales bajo selecciones actuales (self-exclusion) — pendiente activar si lo necesitas:
  // const availableFiltersValues = await computeAvailableFiltersValuesGlobal({
  //   storefront,
  //   country, language, collectionId,
  //   productMetafields,      // de config, para cubrir todas las facetas
  //   variantMetafields,
  //   sortKey, reverse,
  //   expectedProductMetafields,
  //   expectedVariantMetafields,
  //   nativeFilters,
  //   tbOriginalFilters,
  //   pageSize: FACETS_PAGE_SIZE,
  //   maxPages: FACETS_MAX_PAGES
  // });
  // const disabledCheckboxes = getDisabledFilters(tbOriginalFilters, availableFiltersValues);

  return {
    mode: 'filtered',
    page,
    per_page: perPage,
    handles: pageSlice,
    hasNextPageFiltered: filteredHandles.length > perPage,
    // disabledCheckboxes
  };
}

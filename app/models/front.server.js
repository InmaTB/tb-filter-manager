import { GET_FILTER_BY_COLLECTION } from "../graphql/collections";
import { unauthenticated } from "../shopify.server";

export async function filterCollection(shop, country, language, collectionId, params) {

  const { storefront } = await unauthenticated.storefront(shop);
  const { admin } = await unauthenticated.admin(shop)

  let tbOriginalFilters;
  try {
    const response = await admin.graphql(GET_FILTER_BY_COLLECTION, { variables: { collectionId: `gid://shopify/Collection/${collectionId}` } });
    const result = await response.json();
    tbOriginalFilters = result?.data?.collection?.metafield?.jsonValue ?? [];
  } catch (error) {
    console.error('Error en query:', error);
  }

  const {
      productMetafields,
      variantMetafields,
  } = getOriginalFilters(tbOriginalFilters);

  const {
      productMetafields: activeProductMetafields,
      variantMetafields: activeVariantMetafields,
      nativeFilters
  } = classifyFilters(params);

  const { 
    expectedProductMetafields, 
    expectedVariantMetafields 
  } = extractExpectedMetafields(params);

  let products;
  let productsf;
  try {
    const query = buildCollectionQuery(country, language, collectionId, productMetafields, variantMetafields);
    const response = await storefront.graphql(query);
    const result = await response.json();
    products = result?.data?.collection?.products?.nodes ?? [];
    const queryf = buildCollectionQuery(country, language, collectionId, activeProductMetafields, activeVariantMetafields);
    const responsef = await storefront.graphql(queryf);
    const resultf = await responsef.json();
    productsf = resultf?.data?.collection?.products?.nodes ?? [];
  } catch (error) {
    console.error('Error en query:', error);
  }
  
  if (!productsf){ 
    console.log('no products')
    return false
  };    

  try {
    const hasProductMetafields = expectedProductMetafields.length > 0;
    const hasVariantMetafields = expectedVariantMetafields.length > 0;
    const hasVendorFilter = nativeFilters.vendor !== null;
    const hasAvailabilityFilter = nativeFilters.availability !== null;
    const hasPriceFilter = nativeFilters.price.gte !== undefined || nativeFilters.price.lte !== undefined;

    const hasAnyFilter = hasProductMetafields || hasVariantMetafields || hasVendorFilter || hasAvailabilityFilter || hasPriceFilter;

    if (!hasAnyFilter) {
      return products;
    }

    const productsFiltered = productsf.filter((product) => {
      const productMetafieldsArray = extractMetafieldsFromObject(product);
      const productOK = hasProductMetafields
        ? metafieldMatches(productMetafieldsArray, expectedProductMetafields)
        : true;

      let variantOK;

      if (hasAvailabilityFilter && nativeFilters.availability === false) {
        // Filtro "no disponible": todas las variantes NO deben estar disponibles
        variantOK = product.variants.nodes.every(variant => !isVariantAvailable(variant));
      } else {
        // Filtro "disponible" o sin filtro de disponibilidad
        variantOK = product.variants.nodes.some((variant) => {
          const variantMetafieldsArray = extractMetafieldsFromObject(variant);
          const variantMetafieldsOK = hasVariantMetafields
            ? metafieldMatches(variantMetafieldsArray, expectedVariantMetafields)
            : true;

          const availabilityOK = hasAvailabilityFilter
            ? nativeFilters.availability
              ? isVariantAvailable(variant) // variante disponible
              : true // ya cubrimos no disponibles arriba
            : true;

          const price = parseFloat(variant.price?.amount ?? product?.priceRange?.minVariantPrice?.amount ?? 0);
          const priceGTE = nativeFilters.price.gte ?? -Infinity;
          const priceLTE = nativeFilters.price.lte ?? Infinity;
          const priceOK = price >= priceGTE && price <= priceLTE;

          return variantMetafieldsOK && availabilityOK && priceOK;
        });
      }

      console.log('hasVendorFilter', hasVendorFilter)
      console.log('hasVeproduct.vendorndorFilter', product.vendor)
      console.log('nativeFilters.vendor', nativeFilters.vendor)

      const vendorOK = hasVendorFilter
        ? product.vendor === nativeFilters.vendor
        : true;

      return productOK && variantOK && vendorOK;
    });
    

  const availableFiltersValues = getAvailableFilterValues(products, expectedProductMetafields, expectedVariantMetafields, nativeFilters, tbOriginalFilters);

  console.log('tbOriginalFilters', tbOriginalFilters)
  console.log('availableFiltersValues', availableFiltersValues)

  const disabledCheckboxes = getDisabledFilters(tbOriginalFilters, availableFiltersValues);

  const handles = productsFiltered.map(p => p.handle);

  console.log('productsFiltered.length', productsFiltered.length)
  console.log('disabledCheckboxes.length', disabledCheckboxes.length)
  console.log('handles', handles)

  return {productsFiltered: handles, disabledCheckboxes,};
} catch (error) {
    console.error('Error en filtered:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

}


// ================================================
//           UTILS
// ================================================
function getOriginalFilters(tbOriginalFilters) {
  const productMetafields = new Set();
  const variantMetafields = new Set();

  for (const wrapper of tbOriginalFilters) {
    const filter = wrapper.filter;
    const paramName = filter.param_name || "";

    // Eliminamos "filter." si existe
    let cleanParamName = paramName.startsWith("filter.") ? paramName.slice(7) : paramName;

    // split 'p.upng.color' => ['p', 'upng', 'color']
    const parts = cleanParamName.split('.');

    if (parts.length >= 3) {
      const [type, namespace, key] = parts;

      if (type === 'p') {
        productMetafields.add(JSON.stringify({ namespace, key }));
      } else if (type === 'v') {
        variantMetafields.add(JSON.stringify({ namespace, key }));
      }
    }
  }

  // Convertir sets de strings JSON a arrays de objetos
  const productMetafieldsArray = Array.from(productMetafields).map(str => JSON.parse(str));
  const variantMetafieldsArray = Array.from(variantMetafields).map(str => JSON.parse(str));

  return {
    productMetafields: productMetafieldsArray,
    variantMetafields: variantMetafieldsArray,
  };
}

function classifyFilters(params) {
  const productMetafields = new Set();
  const variantMetafields = new Set();
  const nativeFilters = {
    vendor: null,
    availability: null,
    price: {}
  };

  for (const [key, value] of params.entries()) {
    // Metacampos de producto
    if (key.startsWith('filter.p.') && key.split('.').length === 4) {
      const [, , namespace, metafieldKey] = key.split('.');
      productMetafields.add({ namespace, key: metafieldKey });
    
    // Metacampos de variante
    } else if (key.startsWith('filter.v.') && key.split('.').length === 4) {
      const [, , namespace, metafieldKey] = key.split('.');
      variantMetafields.add({ namespace, key: metafieldKey });

    // Vendor
    } else if (key === 'filter.p.vendor') {
      nativeFilters.vendor = value;

    // Availability
    } else if (key === 'filter.v.availability') {
      nativeFilters.availability = value === 'true';

    // Price filters
    } else if (key === 'filter.v.price.gte') {
      nativeFilters.price.gte = parseFloat(value);
    } else if (key === 'filter.v.price.lte') {
      nativeFilters.price.lte = parseFloat(value);
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

    const parts = key.split('.'); // ['filter','p','ns','key'] o ['filter','p','vendor']

    // Metacampos de PRODUCTO: filter.p.{namespace}.{key}
    if (parts[0] === 'filter' && parts[1] === 'p') {
      // Ignorar vendor (no es metafield) y asegurar 4 partes
      if (parts.length === 4) {
        const [, , namespace, mfKey] = parts;
        expectedProductMetafields.push({
          namespace,
          key: mfKey,
          values: [value].flat()
        });
      }
      continue; // evitar que pase abajo
    }

    // Metacampos de VARIANTE: filter.v.{namespace}.{key}
    if (parts[0] === 'filter' && parts[1] === 'v') {
      // Ignorar nativos: price.*, availability
      if (parts.length === 4) {
        const [, , namespace, mfKey] = parts;
        if (namespace !== 'price' && namespace !== 'availability') {
          expectedVariantMetafields.push({
            namespace,
            key: mfKey,
            values: [value].flat()
          });
        }
      }
    }
  }

  return { expectedProductMetafields, expectedVariantMetafields };
}


function isVariantAvailable(variant) {
  const permitePedidos = variant.v_mfpermite?.value === true;
  return variant.quantityAvailable > 0 || permitePedidos;
}

function metafieldFragment(metafieldsArray) {
  if (!metafieldsArray.length) return "";

  const uniqueRequests = new Set(
    metafieldsArray.map(({ namespace, key }) => `${namespace}___${key}`)
  );

  return [...uniqueRequests]
    .map((entry, index) => {
      const [namespace, key] = entry.split("___");
      return `mf_${index}: metafield(namespace: "${namespace}", key: "${key}") { value namespace key }`;
    })
    .join("\n");
}

function buildCollectionQuery(country, language, collectionId, productMetafields, variantMetafields) {
  const productMetafieldsFragment = metafieldFragment(productMetafields);
  const variantMetafieldsFragment = metafieldFragment(variantMetafields);

  const inContext = `@inContext(language: ${language}, country: ${country})`;

  return `#graphql
    query CollectionProducts ${inContext}  {
      collection(id: "gid://shopify/Collection/${collectionId}") {
        products(first: 250) {
          nodes {
            id
            title
            handle
            vendor
            url: onlineStoreUrl
            priceRange {
                maxVariantPrice {
                    amount
                }
                minVariantPrice {
                    amount
                }
            }
            selectedOrFirstAvailableVariant {
                id
                quantityAvailable
                v_mfpermite: metafield(namespace: "upng", key: "permite_pedidos") {
                    value
                }
            }
            ${productMetafieldsFragment}
            variants(first: 100) {
              nodes {
                id
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

function extractMetafieldsFromObject(obj) {
  return Object.entries(obj)
    .filter(([key, _]) => key.startsWith('mf_'))
    .map(([_, value]) => value);
}

function metafieldMatches(metafieldsObjOrArray  = {}, expected = []) {
  // Convierte el objeto de metafields a array
  const metafieldsArray = Array.isArray(metafieldsObjOrArray)
    ? metafieldsObjOrArray
    : Object.values(metafieldsObjOrArray);
  if (!metafieldsArray.length) return false;

  const groupedExpected = expected.reduce((acc, { namespace, key, values }) => {
    const k = `${namespace}.${key}`;
    if (!acc[k]) {
      acc[k] = { namespace, key, values: new Set(values) };
    } else {
      values.forEach(v => acc[k].values.add(v));
    }
    return acc;
  }, {});

  // Cambié .every a .some para OR entre los filtros esperados
  return Object.values(groupedExpected).every(({ namespace, key, values }) => {
    return metafieldsArray.some((mf) => {
      return mf?.namespace === namespace && mf?.key === key && values.has(mf.value);
    });
  });
}

// Paso 1: obtener los valores de filtros todavía válidos en los productos filtrados
function getAvailableFilterValues (filteredProducts) {
  const available = {};

  for (const product of filteredProducts) {
    // Metafields de producto
    for (const mf of collectMfAliases(product)) {
      const key = `p.${mf.namespace}.${mf.key}`;
      if (!available[key]) available[key] = new Set();
      for (const val of explodeValue(mf)) {
        available[key].add(val);
      }
    }

    // Vendor
    if (!available["p.vendor"]) available["p.vendor"] = new Set();
    if (product.vendor) available["p.vendor"].add(product.vendor);

    // Variantes
    for (const variant of product.variants.nodes || []) {
      for (const mf of collectMfAliases(variant)) {
        const key = `v.${mf.namespace}.${mf.key}`;
        if (!available[key]) available[key] = new Set();
        for (const val of explodeValue(mf)) {
          available[key].add(val);
        }
      }

      // Disponibilidad
      if (!available["v.availability"]) available["v.availability"] = new Set();
      available["v.availability"].add(isVariantAvailable(variant) ? "available" : "unavailable");
    }
  }

  // Convertimos Sets a arrays
  const normalized = {};
  for (const key in available) {
    normalized[key] = [...available[key]];
  }

  return normalized;
}


function getDisabledFilters(tbOriginalFilters, availableFilterValues) {
  const disabledCheckboxes = [];

  for (const wrapper of tbOriginalFilters) {
    const filter = wrapper.filter;

    for (const value of filter.values) {
      const paramName = value.param_name;
      const val = value.value;

      const key = getAvailableKeyFromParamName(paramName); // clave para buscar en availableFilterValues

      const availableValues = availableFilterValues[key] || [];

      if (!availableValues.includes(val)) {
        disabledCheckboxes.push({
          paramName,
          value: val
        });
      }
    }
  }

  return disabledCheckboxes;
}

function getAvailableKeyFromParamName(paramName) {
  if (paramName.startsWith("filter.")) {
    paramName = paramName.slice(7);
  }
  return paramName;
}

function explodeValue(mf) {
  if (!mf || mf.value == null) return [];
  let raw = mf.value;
  // Intenta JSON primero (para arrays tipo ["a","b"])
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch (_) {}
  // Fallback: separadores comunes
  return String(raw)
    .split(/[\|,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function collectMfAliases(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .filter(([k]) => k.startsWith('mf_'))
    .map(([, mf]) => mf)
    .filter(Boolean);
}

function groupExpectedByKey(expectedArr) {
  // { "ns.key": Set(values) }
  const map = new Map();
  for (const e of expectedArr || []) {
    const k = `${e.namespace}.${e.key}`;
    if (!map.has(k)) map.set(k, new Set());
    for (const v of e.values || []) map.get(k).add(String(v));
  }
  return map;
}

function deriveFacets(tbOriginalFilters) {
  // Devuelve descriptores de faceta con: {scope:'p'|'v'|'vendor'|'availability', namespace, key, param}
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

  // 1) Metacampos de variante (TODOS excepto la faceta evaluada, ya venimos sin ella en evsMap)
  if (evsMap && evsMap.size) {
    const vMfs = collectMfAliases(variant); // [{namespace,key,value}]
    // Para cada "ns.key" seleccionado, el variant debe tener ALGUNO de los valores (OR dentro de key)
    for (const [k, valuesSet] of evsMap.entries()) {
      const [ns, key] = k.split('.');
      const hasAny = vMfs.some(mf => mf?.namespace === ns && mf?.key === key && valuesSet.has(String(mf.value)));
      if (!hasAny) return false;
    }
  }

  // 2) Disponibilidad (si está activa y no la estamos ignorando)
  if (!ignoreAvailability && nativeFilters?.availability !== null) {
    const ok = nativeFilters.availability ? isVariantAvailable(variant) : !isVariantAvailable(variant);
    if (!ok) return false;
  }

  // 3) Precio (si está activo)
  const gte = nativeFilters?.price?.gte;
  const lte = nativeFilters?.price?.lte;
  if (gte !== undefined || lte !== undefined) {
    const p = parseFloat(variant?.price?.amount ?? product?.priceRange?.minVariantPrice?.amount ?? 'NaN');
    const priceOK =
      (gte === undefined || p >= gte) &&
      (lte === undefined || p <= lte);
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
 * Calcula, para CADA faceta, los valores que seguirían dando resultados
 * aplicando TODAS las selecciones ACTUALES EXCEPTO la de esa faceta (“self-exclusion”).
 * Devuelve un mapa { "p.ns.key" | "v.ns.key" | "p.vendor" | "v.availability": string[] }.
 */
function getAvailableFilterValues(productsAll, expectedProductMetafields, expectedVariantMetafields, nativeFilters, tbOriginalFilters) {
  const facets = deriveFacets(tbOriginalFilters);
  const epsFull = groupExpectedByKey(expectedProductMetafields);
  const evsFull = groupExpectedByKey(expectedVariantMetafields);

  const out = {};

  for (const facet of facets) {
    // Construye selección "otros filtros" excluyendo ESTA faceta
    const epsMap = new Map(epsFull);
    const evsMap = new Map(evsFull);
    let ignoreVendor = false;
    let ignoreAvailability = false;

    if (facet.scope === 'p') {
      const k = `${facet.namespace}.${facet.key}`;
      epsMap.delete(k);
    } else if (facet.scope === 'v') {
      const k = `${facet.namespace}.${facet.key}`;
      evsMap.delete(k);
    } else if (facet.scope === 'vendor') {
      ignoreVendor = true;
    } else if (facet.scope === 'availability') {
      ignoreAvailability = true;
    }

    const acc = new Set();

    for (const product of productsAll || []) {
      // Vendor (si está seleccionado y no lo ignoramos)
      if (!ignoreVendor && nativeFilters?.vendor && product?.vendor !== nativeFilters.vendor) continue;

      // Metacampos de producto (otros)
      if (!productMatchesProductMfs(product, epsMap)) continue;

      // ¿Existe alguna variante que cumpla los filtros de variante (otros)?
      const variants = product?.variants?.nodes || [];
      const hasVariantOtherOK =
        evsMap.size || nativeFilters?.availability !== null || nativeFilters?.price?.gte !== undefined || nativeFilters?.price?.lte !== undefined
          ? variants.some(v => variantMatchesOtherConstraints(v, product, evsMap, nativeFilters, { ignoreAvailability }))
          : true;

      if (!hasVariantOtherOK) continue;

      // Acumular valores de la faceta
      if (facet.scope === 'vendor') {
        if (product.vendor) acc.add(String(product.vendor));
      } else if (facet.scope === 'availability') {
        // Para availability, miramos variantes que pasan "otros filtros" pero ignorando availability
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

    // key de salida
    let outKey = '';
    if (facet.scope === 'vendor') outKey = 'p.vendor';
    else if (facet.scope === 'availability') outKey = 'v.availability';
    else outKey = `${facet.scope}.${facet.namespace}.${facet.key}`;

    out[outKey] = [...acc];
  }

  return out;
}

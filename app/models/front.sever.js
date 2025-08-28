import { unauthenticated } from "../shopify.server";

export async function filterCollection(shop, collectionId, params) {
    
  const { storefront } = await unauthenticated.storefront(shop);

  const {
      productMetafields,
      variantMetafields,
      nativeFilters
  } = classifyFilters(params);

  const { 
    expectedProductMetafields, 
    expectedVariantMetafields 
  } = extractExpectedMetafields(params);

  let products;
  try {
    const query = buildCollectionQuery(collectionId, productMetafields, variantMetafields);
    const response = await storefront.graphql(query);
    const result = await response.json();
    products = result?.data?.collection?.products?.nodes ?? [];
  } catch (error) {
    console.error('Error en query:', error);
  }
  
  if (!products) return false;    

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

    const filtered = products.filter((product) => {
      const productMetafieldsArray = extractMetafieldsFromObject(product);
      const productOK = hasProductMetafields
        ? metafieldMatches(productMetafieldsArray, expectedProductMetafields)
        : true;

        console.log('productOK',productOK)
        console.log('hasProductMetafields',hasProductMetafields)
        console.log('product.metafields',product.metafields)
        console.log('expectedProductMetafields',expectedProductMetafields)

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

          const price = parseFloat(variant.price?.amount ?? 0);
          const priceGTE = nativeFilters.price.gte ?? -Infinity;
          const priceLTE = nativeFilters.price.lte ?? Infinity;
          const priceOK = price >= priceGTE && price <= priceLTE;

          return variantMetafieldsOK && availabilityOK && priceOK;
        });
      }

      const vendorOK = hasVendorFilter
        ? product.vendor === nativeFilters.vendor
        : true;

      return productOK && variantOK && vendorOK;
    });
    console.log('filtered.length', filtered.length)
    // 🔽 Devuelve solo un array de IDs de producto
    return filtered;
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
    if (key.startsWith('filter.p.')) {
      const [, , namespace, mfKey] = key.split('.');
      expectedProductMetafields.push({
        namespace,
        key: mfKey,
        values: [value].flat()
      });
    }
    if (key.startsWith('filter.v.')) {
      const [, , namespace, mfKey] = key.split('.');
      expectedVariantMetafields.push({
        namespace,
        key: mfKey,
        values: [value].flat()
      });
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

function buildCollectionQuery(collectionId, productMetafields, variantMetafields) {
  const productMetafieldsFragment = metafieldFragment(productMetafields);
  const variantMetafieldsFragment = metafieldFragment(variantMetafields);

  return `#graphql
    query {
      collection(id: "gid://shopify/Collection/${collectionId}") {
        products(first: 250) {
          nodes {
            id
            title
            handle
            vendor
            url: onlineStoreUrl
            featuredImage {
                url
                width
                height
                altText
            }
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
            compareAtPriceRange {
                maxVariantPrice {
                    amount
                }
                minVariantPrice {
                    amount
                }
            }
            ${productMetafieldsFragment}
            variants(first: 100) {
              nodes {
                id
                ${variantMetafieldsFragment}
                quantityAvailable
                v_mfpermite: metafield(namespace: "upng", key: "permite_pedidos") { value }
                v_mffecha: metafield(namespace: "upng", key: "fecha-proxima-llegada") { value }
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

function metafieldMatches(metafieldsObj = {}, expected = []) {
  // Convierte el objeto de metafields a array
  const metafieldsArray = Object.values(metafieldsObj);
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
  return Object.values(groupedExpected).some(({ namespace, key, values }) => {
    return metafieldsArray.some((mf) => {
      return mf?.namespace === namespace && mf?.key === key && values.has(mf.value);
    });
  });
}




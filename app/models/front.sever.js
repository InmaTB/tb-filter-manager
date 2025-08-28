import { unauthenticated } from "../shopify.server";

export async function filterCollection(shop, collectionId, params) {
    
    const { storefront } = await unauthenticated.storefront(shop);

    const {
        productMetafields,
        variantMetafields,
        nativeFilters
    } = classifyFilters(params);
console.log('aaaa')
  
    const query = buildCollectionQuery(collectionId, productMetafields, variantMetafields);
    const response = await storefront.graphql(query);

    
    console.log('bbbb')
    const result = await response.json();

    const products = result?.data?.collection?.products?.nodes ?? [];

    const expectedProductMetafields = [];
    const expectedVariantMetafields = [];

    console.log('cccc')
    for (const [key, value] of params.entries()) {
        console.log('dddd')
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
console.log('eeee')
try {
        const filtered = products.filter((product) => {
        const productOK = metafieldMatches(product.metafields, expectedProductMetafields);

        const variantOK = expectedVariantMetafields.length === 0
            ? true
            : product.variants.nodes.some((variant) =>
                metafieldMatches(variant.metafields, expectedVariantMetafields)
            );

        return productOK && variantOK;
    });

        console.log('ffff')
    console.log(filtered)
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
  const nativeFilters = {};

  for (const [key, value] of params.entries()) {
    if (key.startsWith('filter.p.')) {
      const [, , namespace, metafieldKey] = key.split('.');
      productMetafields.add({ namespace, key: metafieldKey });
    } else if (key.startsWith('filter.v.')) {
      const [, , namespace, metafieldKey] = key.split('.');
      variantMetafields.add({ namespace, key: metafieldKey });
    } else {
      nativeFilters[key] = value;
    }
  }

  return {
    productMetafields: Array.from(productMetafields),
    variantMetafields: Array.from(variantMetafields),
    nativeFilters,
  };
}

function metafieldFragment(metafields) {
  if (metafields.length === 0) return '';

  const identifiers = metafields.map(
    ({ namespace, key }) => `{ namespace: "${namespace}", key: "${key}" }`
  );

  return `
    metafields(identifiers: [${identifiers.join(',')}]) {
      namespace
      key
      value
    }
  `;
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
                v_mffecha: metafield(namespace: "upng", key: "fecha-proxima-llegada") {
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


function metafieldMatches(metafields = [], expected) {
  return expected.every(({ namespace, key, values }) => {
    return metafields.some((mf) => {
      return (
        mf.namespace === namespace &&
        mf.key === key &&
        values.includes(mf.value)
      );
    });
  });
}

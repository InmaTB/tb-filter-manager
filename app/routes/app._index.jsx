import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
} from "@shopify/polaris";
import { Link } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {

  return (
    <Page>
      <TitleBar title="The Bath Funcionalidades">
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Configuración
                  </Text>
                  <Link to="/app/filters/templates">Configuración</Link>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}


// import { useEffect, useState } from "react";
// import {
//   Page,
//   Layout,
//   Card,
//   Text,
//   BlockStack,
//   Button,
//   ResourceList,
//   ResourceItem,
//   Spinner,
//   Checkbox,
// } from "@shopify/polaris";
// import { CheckIcon, ArrowLeftIcon } from "@shopify/polaris-icons";

// export default function Index() {
//   const [collections, setCollections] = useState([]);
//   const [selectedCollection, setSelectedCollection] = useState(null);
//   const [variantMetafields, setVariantMetafields] = useState([]);
//   const [selectedKeys, setSelectedKeys] = useState([]);
//   const [loading, setLoading] = useState(false);

//   // 1. Cargar colecciones
//   useEffect(() => {
//     fetch("/api/admin/collections")
//       .then((res) => res.json())
//       .then(setCollections);
//   }, []);

//   // 2. Cargar metacampos + config de filtros para una colección
//   useEffect(() => {
//     if (!selectedCollection) return;

//     setLoading(true);
//     Promise.all([
//       fetch(
//         `/api/admin/variant-metafields?collectionId=${selectedCollection.id}`,
//       ).then((res) => res.json()),
//       fetch(
//         `/api/admin/collection-config?collectionId=${selectedCollection.id}`,
//       ).then((res) => res.json()),
//     ])
//       .then(([metafields, config]) => {
//         setVariantMetafields(metafields);

//         const selected = (config?.mostrar || [])
//           .filter((item) => item.tipo === "metafield")
//           .map((item) => `${item.namespace}.${item.key}`);

//         setSelectedKeys(selected);
//       })
//       .finally(() => setLoading(false));
//   }, [selectedCollection]);

//   // 3. Cambiar selección
//   const toggleKey = (key) => {
//     setSelectedKeys((prev) =>
//       prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
//     );
//   };

//   // 4. Guardar configuración
//   const saveConfig = async () => {
//     const mostrar = variantMetafields
//       .filter((mf) => selectedKeys.includes(`${mf.namespace}.${mf.key}`))
//       .map((mf) => ({
//         tipo: "metafield",
//         namespace: mf.namespace,
//         key: mf.key,
//         label: mf.name,
//       }));

//     const res = await fetch(`/api/admin/collections/save-config`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         collectionId: selectedCollection.id,
//         config: { mostrar },
//       }),
//     });

//     const json = await res.json();
//     if (json.success)
//       shopify.toast.show("Fitros guardados", {
//         duration: 5000,
//       });
//     elseshopify.toast.show("Error al guardar", {
//       duration: 5000,
//       isError: true,
//     });
//   };

//   return (
//     <Page title="Configuración de Filtros por Colección">
//       <Layout>
//         <Layout.Section>
//           {!selectedCollection ? (
//             <Card>
//               <ResourceList
//                 resourceName={{ singular: "colección", plural: "colecciones" }}
//                 items={collections}
//                 renderItem={(collection) => (
//                   <ResourceItem
//                     id={collection.id}
//                     accessibilityLabel={`Configurar filtros para ${collection.title}`}
//                   >
//                     <div
//                       style={{
//                         display: "flex",
//                         justifyContent: "space-between",
//                         alignItems: "center",
//                         width: "100%",
//                         cursor: "pointer",
//                       }}
//                       onClick={() => setSelectedCollection(collection)}
//                     >
//                       <Text variant="bodyMd" fontWeight="medium">
//                         {collection.title}
//                       </Text>
//                       <Button
//                         variant="tertiary"
//                         onClick={() => setSelectedCollection(collection)}
//                       >
//                         Configurar
//                       </Button>
//                     </div>
//                   </ResourceItem>
//                 )}
//               />
//             </Card>
//           ) : (
//             <Card title={`Filtros para: ${selectedCollection.title}`} sectioned>
//               {loading ? (
//                 <Spinner accessibilityLabel="Cargando filtros" size="large" />
//               ) : (
//                 <BlockStack gap="200">
//                   {variantMetafields.map((mf) => {
//                     const key = `${mf.namespace}.${mf.key}`;
//                     return (
//                       <Checkbox
//                         key={key}
//                         label={`${mf.key}`}
//                         checked={selectedKeys.includes(key)}
//                         onChange={() => toggleKey(key)}
//                       />
//                     );
//                   })}
//                   <div
//                     style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}
//                   >
//                     <Button
//                       icon={ArrowLeftIcon}
//                       onClick={() => setSelectedCollection(null)}
//                       variant="tertiary"
//                     >
//                       Volver a colecciones
//                     </Button>
//                     <Button
//                       icon={CheckIcon}
//                       onClick={saveConfig}
//                       variant="primary"
//                     >
//                       Guardar configuración
//                     </Button>
//                   </div>
//                 </BlockStack>
//               )}
//             </Card>
//           )}
//         </Layout.Section>
//       </Layout>
//     </Page>
//   );
// }

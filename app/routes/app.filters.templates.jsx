import {
  Card,
  Layout,
  Page,
  BlockStack,
  Button,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Box,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getTemplates } from "../models/templates.server";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }) => {
  console.log('aaaa')
  const { admin } = await authenticate.admin(request);
  console.log('bbbb')
  const templates = await getTemplates(admin.graphql);
console.log('cccc')
  console.log(templates)
console.log('ddddd')
  return { templates };
};

export default function FiltersTemplatesIndex() {
  const { templates } = useLoaderData();

  const resourceName = { singular: "plantilla", plural: "plantillas" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(templates);

  return (
    <Page>
      <TitleBar title="Plantillas de filtros" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Button variant="primary" url={`/app/filters/template/0`}>
                Crear plantilla
              </Button>

              {(!templates || templates.length === 0) ? (
                <Box paddingBlockStart="400">
                  <EmptyState
                    heading="Aún no hay plantillas"
                    image=""
                  >
                    <p>Crea tu primera plantilla para asignar filtros a colecciones.</p>
                  </EmptyState>
                </Box>
              ) : (
                <IndexTable
                  resourceName={resourceName}
                  itemCount={templates.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Título" },
                    { title: "Colecciones" },
                    { title: "Filtros" },
                    { title: "Estado" },
                    { title: "" },
                  ]}
                >
                  {templates.map((t, index) => (
                    <IndexTable.Row
                      id={t.id}
                      key={t.id}
                      selected={selectedResources.includes(t.id)}
                      position={index}
                    >
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {t.title || t.handle}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">
                          {t.collections?.length ?? 0}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">
                          {t.filtersIds?.length ?? 0}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={t.active ? "success" : "critical"}>
                          {t.active ? "Activa" : "Inactiva"}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Button
                          variant="tertiary"
                          url={`/app/filters/template/${t.id}`}
                        >
                          Editar
                        </Button>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

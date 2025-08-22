import { Form, useNavigate } from "@remix-run/react";
import {
  Banner,
  Card,
  Text,
  Layout,
  PageActions,
  TextField,
  BlockStack,
  Box,
  InlineGrid,
  Divider,
} from "@shopify/polaris";
import { useCallback, useMemo, useState } from "react";
import { useTemplateForm } from "../../hooks/useTemplateForm";
import { CollectionPicker } from "../CollectionPicker/CollectionPicker";
import { MetafieldPicker } from "../MetafieldPicker/MetafieldPicker";

export function TemplateForm({
  initialData,
  collections: allCollections,
  filters: allFilters,
  isEditing = false,
  submitErrors = [],
  isLoading = false,
  success = false,
}) {

  const { formState, setField, submit } = useTemplateForm({initialData});
  const [collections, setCollections] = useState(allCollections);
  const [filters, setFilters] = useState(allFilters);
  const navigate = useNavigate();

  const errorBanner = useMemo(
    () =>
      submitErrors.length > 0 ? (
        <Layout.Section>
          <Banner tone="critical">
            <p>Ha ocurrido un problema con el envío del formulario:</p>
            <ul>
              {submitErrors.map(({ message, field }, index) => (
                <li key={index}>
                  {field.join(".")} {message}
                </li>
              ))}
            </ul>
          </Banner>
        </Layout.Section>
      ) : null,
    [submitErrors],
  );

const successBanner = useMemo(() => {
  if (!success) {
    return null;
  }

  if (!isEditing) {
    return (
      <Layout.Section>
        <Banner tone="success">
          <p>Descuento guardado correctamente</p>
        </Banner>
      </Layout.Section>
    );
  } else {
    shopify.toast.show('Descuento actualizado correctamente');
    return null;
  }
}, [success, isEditing]);

  const handleCollectionSelect = useCallback(
    async (selectedCollections) => {
      setField(
        "collectionIds",
        selectedCollections.map((collection) => collection.id),
      );
      setCollections(selectedCollections);
    },
    [setField],
  );

  return (
    <Layout>
      <Layout.Section>
        <Form method="post" id="filters-template-form">
          <input
            type="hidden"
            name="template"
            value={JSON.stringify({
              title: formState.title || '',
              collectionIds: formState.collectionIds || [],
              filtersIds: formState.filtersIds || [],
            })}
          />
          <BlockStack gap="400">
            <Card>
              <Box>
                <BlockStack>
                  <Text variant="headingMd" as="h2">
                    {isEditing ? "Editar plantilla" : "Crear platilla"}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <BlockStack gap="400">
                      <>
                        <Divider></Divider>
                        <InlineGrid columns={3} gap="800">
                        <TextField
                          label="Nombre"
                          autoComplete="off"
                          value={formState.title}
                          onChange={(value) => setField("title", value)}
                        />
                        </InlineGrid>
                        <Divider></Divider>
                        <Text variant="headingMd" as="h6">Categorias</Text>
                        <CollectionPicker
                          onSelect={handleCollectionSelect}
                          selectedCollectionIds={formState.collectionIds || []}
                          collections={collections}
                          buttonText="Selecciona las colecciones"
                        />
                        <Text variant="headingMd" as="h6">Filtros</Text>
                        <MetafieldPicker
                            sections={filters}                              
                            value={formState.filtersIds || []}              
                            onChange={(next) => setField('filtersIds', next)} 
                            />
                      </>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>

          </BlockStack>
          <Layout.Section>
            {errorBanner}
            {successBanner}
            <PageActions
              primaryAction={{
                content: "Guardar plantilla",
                loading: isLoading,
                onAction: submit
              }}
              secondaryActions={[
                {
                  content: "Descartar",
                  onAction: () => navigate("/app/filters/templates"),
                },
              ]}
            />
          </Layout.Section>
        </Form>
      </Layout.Section>
    </Layout>
  );
}

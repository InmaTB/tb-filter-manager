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
  IndexFilters,
  useSetIndexFiltersMode,
  Toast,
  Link,
  Frame,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getTemplates,
  removeTemplate,
  updateTemplateStatus,
} from "../models/templates.server";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const templates = await getTemplates(admin.graphql);
  return { templates };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const ids = JSON.parse(formData.get("ids") || "[]");
  const actionType = formData.get("actionType");

  let results = [];
  if (actionType === "remove") {
    results = await Promise.all(ids.map((gid) => removeTemplate(admin.graphql, gid)));
  } else if (actionType === "activate" || actionType === "deactivate") {
    const op = actionType === "activate" ? "ACTIVATE" : "DEACTIVATE";
    results = await Promise.all(ids.map((gid) => updateTemplateStatus(admin.graphql, gid, op)));
  } else {
    return { success: false, errors: [{ message: "Acción no soportada" }] };
  }

  const allErrors = results.flatMap((r) => r.errors || []);
  if (allErrors.length) return { success: false, errors: allErrors };

  return { success: true, actionType };
};

export default function FiltersTemplatesIndex() {
  const { templates } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const { mode, setMode } = useSetIndexFiltersMode();
  const [sortSelected, setSortSelected] = useState(["title asc"]);
  const [queryValue, setQueryValue] = useState("");

  const getShortId = (gid) => String(gid).split('/').pop();

  const handleFiltersQueryChange = useCallback((value) => setQueryValue(value), []);
  const handleClearAll = useCallback(() => {
    setQueryValue("");
    setSortSelected(["title asc"]);
  }, []);

  const sortOptions = [
    { label: "Título", value: "title asc", directionLabel: "A-Z" },
    { label: "Título", value: "title desc", directionLabel: "Z-A" },
  ];

  const [toastProps, setToastProps] = useState(null);
  const toastMarkup = toastProps ? (
    <Toast content={toastProps.content} error={toastProps.error} onDismiss={() => setToastProps(null)} />
  ) : null;

  const filteredRows = useMemo(() => {
    const q = queryValue.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      const title = String(t.title || "").toLowerCase();
      const handle = String(t.handle || "").toLowerCase();
      return title.includes(q) || handle.includes(q);
    });
  }, [templates, queryValue]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    const [key, direction] = (sortSelected?.[0] || "title asc").split(" ");
    rows.sort((a, b) => {
      const av = String(a[key] ?? "").toLowerCase();
      const bv = String(b[key] ?? "").toLowerCase();
      if (av > bv) return direction === "asc" ? 1 : -1;
      if (av < bv) return direction === "asc" ? -1 : 1;
      return 0;
    });
    return rows;
  }, [filteredRows, sortSelected]);

  const resourceName = { singular: "plantilla", plural: "plantillas" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(sortedRows);

  // bulk actions
  const handleBulkActivate = () => {
    fetcher.submit(
      { ids: JSON.stringify(selectedResources), actionType: "activate" },
      { method: "post", action: "." }
    );
  };
  const handleBulkDeactivate = () => {
    fetcher.submit(
      { ids: JSON.stringify(selectedResources), actionType: "deactivate" },
      { method: "post", action: "." }
    );
  };
  const handleBulkRemove = () => {
    fetcher.submit(
      { ids: JSON.stringify(selectedResources), actionType: "remove" },
      { method: "post", action: "." }
    );
  };

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data != null) {
      const actionType = fetcher.data.actionType;
      if (fetcher.data.success) {
        const verb =
          actionType === "remove"
            ? "eliminadas"
            : actionType === "activate"
            ? "activadas"
            : "desactivadas";
        setToastProps({ content: `Plantillas ${verb} correctamente` });
      } else if (fetcher.data.errors) {
        const msgs = fetcher.data.errors
          .map((e) => (e.field ? `${e.field.join(".")}: ${e.message}` : e.message))
          .join("; ");
        setToastProps({ content: `Error: ${msgs}`, error: true });
      }
    }
  }, [fetcher.state, fetcher.data, fetcher.submission]);

  const handleNavigateToTemplate = useCallback(
    (e, id) => {
      e.stopPropagation();
      navigate(`/app/filters/template/${id}`);
    },
    [navigate]
  );

  return (
    <Frame>
      <Page>
        <TitleBar title="Plantillas de filtros" />
        {toastMarkup}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Button variant="primary" url={`/app/filters/template/0`}>
                  Crear plantilla
                </Button>

                {!sortedRows?.length ? (
                  <Box paddingBlockStart="400">
                    <EmptyState heading="Aún no hay plantillas" image="">
                      <p>Crea tu primera plantilla para asignar filtros a colecciones.</p>
                    </EmptyState>
                  </Box>
                ) : (
                  <BlockStack>
                    <IndexFilters
                      sortOptions={sortOptions}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      queryValue={queryValue}
                      queryPlaceholder="Buscar por título…"
                      onQueryChange={handleFiltersQueryChange}
                      onQueryClear={() => setQueryValue("")}
                      tabs={[]}
                      filters={[]}
                      appliedFilters={[]}
                      onClearAll={handleClearAll}
                      mode={mode}
                      setMode={setMode}
                    />

                    <IndexTable
                      resourceName={resourceName}
                      itemCount={sortedRows.length}
                      selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
                      onSelectionChange={handleSelectionChange}
                      headings={[
                        { title: "Título" },
                        { title: "Colecciones" },
                        { title: "Filtros" },
                        { title: "Estado" },
                      ]}
                      bulkActions={[
                        { content: "Activar", onAction: handleBulkActivate },
                        { content: "Desactivar", onAction: handleBulkDeactivate },
                        { content: "Eliminar", icon: DeleteIcon, destructive: true, onAction: handleBulkRemove },
                      ]}
                    >
                      {sortedRows.map((t, index) => (
                        <IndexTable.Row
                          id={t.id}
                          key={t.id}
                          selected={selectedResources.includes(t.id)}
                          position={index}
                        >
                          <IndexTable.Cell>
                            <Link
                              monochrome
                              removeUnderline
                              onClick={(e) => handleNavigateToTemplate(e, getShortId(t.id))}
                            >
                              <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {t.title || t.handle}
                              </Text>
                            </Link>
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
                        </IndexTable.Row>
                      ))}
                    </IndexTable>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}

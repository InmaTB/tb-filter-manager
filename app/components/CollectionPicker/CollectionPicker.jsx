import {
  Button,
  BlockStack,
  InlineStack,
  Link,
  Divider,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { useMemo, useCallback } from "react";

export function CollectionPicker({
  onSelect,
  selectedCollectionIds = [],
  collections = [],
  buttonText = "Select collections",
}) {
  // Normaliza ID para evitar mismatches (GID vs numérico)
  const norm = (id) => (id ? String(id) : "");
  const toKey = (id) => {
    const s = norm(id);
    return s.includes("/") ? s.split("/").pop() : s;
  };

  // Conjunto de IDs seleccionados (normalizados)
  const selectedIdSet = useMemo(() => {
    return new Set(selectedCollectionIds.map((id) => norm(id)));
  }, [selectedCollectionIds]);

  // Solo las colecciones seleccionadas (comparando en el mismo formato)
  const selectedCollections = useMemo(() => {
    return collections.filter((c) => selectedIdSet.has(norm(c.id)));
  }, [collections, selectedIdSet]);

  const handleSelect = useCallback(async () => {
    const selected = await window.shopify.resourcePicker({
      type: "collection",
      action: "select",
      multiple: true,
      selectionIds: Array.from(selectedIdSet).map((id) => ({
        id, // pasa el GID completo si tus selectedCollectionIds son GIDs
        type: "collection",
      })),
    });

    if (selected) {
      const next = selected.map((c) => ({ id: c.id, title: c.title }));
      onSelect(next); // siempre devolvemos SOLO las seleccionadas
    }
  }, [selectedIdSet, onSelect]);

  const handleRemove = useCallback(
    (collectionId) => {
      // elimina de las seleccionadas actuales
      const next = selectedCollections.filter((c) => norm(c.id) !== norm(collectionId));
      onSelect(next);
    },
    [onSelect, selectedCollections],
  );

  const selectedCollectionsText = selectedCollectionIds?.length
    ? `(${selectedCollectionIds.length} selected)`
    : "";

  return (
    <BlockStack gap="400">
      <Button onClick={handleSelect}>
        {buttonText}
        {selectedCollectionsText}
      </Button>

      {selectedCollections.length > 0 ? (
        <BlockStack gap="200">
          {selectedCollections.map((collection) => (
            <BlockStack gap="200" key={collection.id}>
              <InlineStack blockAlign="center" align="space-between">
                <Link
                  url={`shopify://admin/collections/${toKey(collection.id)}`}
                  monochrome
                  removeUnderline
                >
                  {collection.title}
                </Link>
                <Button
                  variant="tertiary"
                  onClick={() => handleRemove(collection.id)}
                  icon={DeleteIcon}
                />
              </InlineStack>
              <Divider />
            </BlockStack>
          ))}
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}

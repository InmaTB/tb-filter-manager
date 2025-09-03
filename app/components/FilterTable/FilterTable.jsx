import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  IndexTable,
  Button,
  Text,
  Box,
  InlineStack,
  BlockStack,
  InlineGrid,
  Badge,
  EmptyState,
  TextField,
} from "@shopify/polaris";

import { DndContext, closestCenter, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function restrictToVerticalAxis({ transform }) {
  return { ...transform, x: 0 };
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Aplana secciones del picker
function flattenMetafields(sections) {
  const out = [];
  (Array.isArray(sections) ? sections : []).forEach((section) => {
    const candidates =
      section?.options ||
      section?.metafields ||
      section?.items ||
      section?.children ||
      [];
    (Array.isArray(candidates) ? candidates : []).forEach((m) => {
      const id = m.id || m.value || m.key || m.metafieldId || m.gid || m.gID;
      const namespace = m.namespace || m.ns || m.ownerNamespace || m.n;
      const key = m.key || m.k;
      const nameMF = m.nameMF;
      const source = m.source;
      const scope =
        m.scope ||
        m.level ||
        m.ownerType ||
        m.type ||
        m.target ||
        (m.isVariant ? "variant" : m.isProduct ? "product" : undefined);
      const label =
        m.label ||
        m.name ||
        m.title ||
        m.text ||
        (namespace && key ? `${namespace}.${key}` : String(id));
      if (id) {
        out.push({
          id: String(id),
          namespace,
          key,
          label,
          scope,
          nameMF,
          source,
          raw: m,
        });
      }
    });
  });
  return out;
}

function buildActiveItems({ vendor, availability, price, selectedMetafields, flatMap }) {
  const items = [];
  if (vendor) {
    items.push({ id: "static:vendor", label: "Marca", type: "Estándar", source: "Proveedor" });
  }
  if (availability) {
    items.push({ id: "static:availability", label: "Disponibilidad", type: "Estándar", source: "Inventario" });
  }
  if (price) {
    items.push({ id: "static:price", label: "Precio", type: "Estándar", source: "Rango de precio" });
  }
  (Array.isArray(selectedMetafields) ? selectedMetafields : []).forEach((mfId) => {
    const mf = flatMap.get(String(mfId));
    if (mf) {
      items.push({
        id: `mfdef:${mf.id}`, // importante: usamos "mfdef:" para alinear con el servidor
        label: mf.nameMF,
        type: mf.scope ? `Metacampo ${mf.scope}` : "Metacampo",
        source: mf.source,
      });
    }
  });
  return items;
}

function DragHandle({ setActivatorNodeRef, attributes, listeners }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Arrastrar para reordenar"
      title="Arrastrar para reordenar"
      style={{
        cursor: "grab",
        background: "transparent",
        border: 0,
        padding: 6,
        lineHeight: 1,
      }}
    >
      ⠿
    </button>
  );
}

/** Fila sortable (usa dnd-kit) */
function SortableRow({ id, index, renderCells }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // opcional: feedback visual
    boxShadow: isDragging ? "0 4px 16px rgba(0,0,0,0.15)" : undefined,
    background: isDragging ? "var(--p-color-bg-surface-hover)" : undefined,
    borderRadius: 8,
  };

  return (
    <IndexTable.Row id={id} position={index}>
      {/* 👇 UNA sola celda que ocupa todas las columnas */}
      <IndexTable.Cell colSpan={5}>
        {/* 👇 Este wrapper SÍ recibe transform */}
        <div ref={setNodeRef} style={style}>
          {/* Maquetamos las 5 “columnas” con Grid para que se vea igual */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 70px 1fr 160px 140px", // ajusta a tu caso
              alignItems: "center",
              gap: "12px",
            }}
          >
            {/* Columna # */}
            <div>
              <Text as="span" variant="bodyMd">{index + 1}</Text>
            </div>

            {/* Columna Mover */}
            <div>
              <DragHandle
                setActivatorNodeRef={setActivatorNodeRef}
                attributes={attributes}
                listeners={listeners}
              />
            </div>

            {/* El resto de celdas las delegamos al padre */}
            {renderCells()}
          </div>
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  );
}


export function FilterTable({
  vendor = false,
  availability = false,
  price = false,
  metafields = [],
  selectedMetafields = [],
  onChangeOrder,
  onChangeLabels,
  initialOrder = [],
  initialLabels = {},
}) {
  const [labels, setLabels] = useState({});
  const [order, setOrder] = useState([]);
  const [activeId, setActiveId] = useState(null); // para overlay opcional
  const didHydrateRef = useRef(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { pressDelay: 120, activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Aplanar picker
  const flatList = useMemo(() => flattenMetafields(metafields), [metafields]);
  const flatMap = useMemo(() => {
    const m = new Map();
    flatList.forEach((f) => m.set(String(f.id), f));
    return m;
  }, [flatList]);

  // Items activos
  const activeItems = useMemo(
    () => buildActiveItems({ vendor, availability, price, selectedMetafields, flatMap }),
    [vendor, availability, price, selectedMetafields, flatMap]
  );

  // Hidratar labels al montar
  useEffect(() => {
    if (initialLabels && typeof initialLabels === "object") {
      setLabels(initialLabels);
    }
    // no avisamos al padre en hidratación
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hidratar orden (cuando ya sabemos los activos)
  useEffect(() => {
    if (!activeItems.length) return;

    setOrder((prev) => {
      if (prev.length > 0) return prev;
      const activeIds = activeItems.map((it) => it.id);
      const next = [
        ...initialOrder.filter((id) => activeIds.includes(id)),
        ...activeIds.filter((id) => !initialOrder.includes(id)),
      ];
      return arraysEqual(prev, next) ? prev : next;
    });

    didHydrateRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems.map((i) => i.id).join("|")]);

  // Mantener orden si cambia la selección (conserva orden previo → añade nuevos al final)
  useEffect(() => {
    const currentIds = activeItems.map((it) => it.id);
    setOrder((prev) => {
      const next = [];
      const currentSet = new Set(currentIds);
      for (const id of prev) if (currentSet.has(id)) next.push(id);
      const prevSet = new Set(prev);
      for (const id of currentIds) if (!prevSet.has(id)) next.push(id);
      return arraysEqual(prev, next) ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems]);

  // Si el orden cambia por cualquier razón (drag, toggles…), notificamos al padre (no en hidratación)
  useEffect(() => {
    if (!didHydrateRef.current) return;
    onChangeOrder?.(order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.join("|")]);

  // Handlers drag
  const onDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    setOrder((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const rowsById = useMemo(() => new Map(activeItems.map((it) => [it.id, it])), [activeItems]);
  const orderedRows = order.map((id) => rowsById.get(id)).filter(Boolean);
  const itemCount = orderedRows.length;

  const updateLabel = (id, value) => {
    setLabels((prev) => {
      const next = { ...prev, [id]: value };
      onChangeLabels?.(next);
      return next;
    });
  };

  const resetLabel = (id) => {
    setLabels((prev) => {
      const next = { ...prev };
      delete next[id];
      onChangeLabels?.(next);
      return next;
    });
  };

function DragHandle({ setActivatorNodeRef, attributes, listeners }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Arrastrar para reordenar"
      title="Arrastrar para reordenar"
      style={{
        cursor: "grab",
        background: "transparent",
        border: 0,
        padding: 6,
        lineHeight: 1,
      }}
    >
      ⠿
    </button>
  );
}



  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingMd">Orden de filtros</Text>
            <Badge tone="info">{itemCount} activos</Badge>
          </InlineStack>

          {itemCount === 0 ? (
            <EmptyState
              heading="No hay filtros activos"
              action={{ content: "Selecciona filtros arriba" }}
              image=""
            >
              <p>Activa Vendor/Disponibilidad/Precio o elige metacampos.</p>
            </EmptyState>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <IndexTable
                  resourceName={{ singular: "filtro", plural: "filtros" }}
                  itemCount={itemCount}
                  selectable={false}
                  headings={[
                    { title: "#" },
                    { title: "Mover" }, // handle de drag
                    { title: "Filtro" },
                    { title: "Fuente" },
                    { title: "Tipo" },
                  ]}
                >
                  {orderedRows.map((row, idx) => (
                    <SortableRow
                      key={row.id}
                      id={row.id}
                      index={idx}
                      renderCells={() => (
                        <>
                          {/* Columna Filtro (editor de label) */}
                          <div>
                            <InlineStack gap="200" align="start" blockAlign="center">
                              <div style={{ minWidth: 260 }}>
                                <TextField
                                  label="Nombre mostrado"
                                  labelHidden
                                  autoComplete="off"
                                  value={labels[row.id] ?? ""}
                                  placeholder={row.label}
                                  onChange={(val) => updateLabel(row.id, val)}
                                />
                              </div>
                              <Button
                                variant="plain"
                                onClick={() => resetLabel(row.id)}
                                disabled={!(row.id in labels)}
                              >
                                Restablecer
                              </Button>
                            </InlineStack>
                          </div>

                          {/* Columna Fuente */}
                          <div>{row.source}</div>

                          {/* Columna Tipo */}
                          <div>{row.type}</div>
                        </>
                      )}
                    />
                  ))}

                </IndexTable>
              </SortableContext>

              {/* Overlay opcional (podrías renderizar nombre/placeholder aquí si quieres) */}
              <DragOverlay dropAnimation={null} />
            </DndContext>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

export default FilterTable;

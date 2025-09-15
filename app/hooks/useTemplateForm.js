import { useSubmit } from "@remix-run/react";
import { useCallback, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export function useTemplateForm({ initialData } = {}) {
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [formState, setFormState] = useState(() => ({
    title: initialData?.title ?? "",
    collectionIds: initialData?.collectionIds ?? [],
    filtersIds: initialData?.filtersIds ?? [],
    includeVendor: initialData?.includeVendor ?? true,
    includeAvailability: initialData?.includeAvailability ?? true,
    includePrice: initialData?.includePrice ?? true,
    filtersOrder: initialData?.filtersOrder ?? [],
    filtersLabels: initialData?.filtersLabels ?? {},
  }));

  const setField = useCallback(
    (field, value) => {
      setFormState((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (!formState.title?.trim()) {
      shopify.toast.show("Introduce un título");
      return;
    }
    if (!formState.collectionIds?.length) {
      shopify.toast.show("Debes seleccionar al menos una categoría");
      return;
    }
    if (!formState.filtersIds?.length) {
      shopify.toast.show("Debes seleccionar al menos un filtro");
      return;
    }

    // Si por seguridad añadiste inputs ocultos espejo en el DOM,
    // léelos y priorízalos (por si cambió algo justo antes del submit).
    let finalOrder = formState.filtersOrder || [];
    let finalLabels = formState.filtersLabels || {};
    try {
      const orderEl = document.getElementById("filtersOrderInput");
      if (orderEl?.value) finalOrder = JSON.parse(orderEl.value);
    } catch {}
    try {
      const labelsEl = document.getElementById("filtersLabelsInput");
      if (labelsEl?.value) finalLabels = JSON.parse(labelsEl.value);
    } catch {}

    const formData = new FormData();
    formData.append(
      "template",
      JSON.stringify({
        title: formState.title,
        collectionIds: formState.collectionIds,
        filtersIds: formState.filtersIds,
        includeVendor: !!formState.includeVendor,
        includeAvailability: !!formState.includeAvailability,
        includePrice: !!formState.includePrice,
        filtersOrder: finalOrder,
        filtersLabels: finalLabels,
      })
    );

    submit(formData, { method: "post" });
  }, [formState, submit, shopify]);

  return {
    formState,
    setField,
    submit: handleSubmit,
  };
}

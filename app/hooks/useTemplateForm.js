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

  }));

  const setField = useCallback((field, value) => {
      setFormState((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(() => {

    if(formState.title == '' ) {
      shopify.toast.show('Introduce un título');
      return;
    }

    if(formState.collectionIds?.length < 1 ) {
      shopify.toast.show('Debes seleccionar al menos una categoría');
      return;
    }

    if(formState.filtersIds?.length < 1 ) {
      shopify.toast.show('Debes seleccionar al menos un filtro');
      return;
    }
    
    const formData = new FormData();
    formData.append(
      "template",
      JSON.stringify({
        title: formState.title,
        collectionIds: formState.collectionIds,
        filtersIds: formState.filtersIds,
        includeVendor: formState.includeVendor,
        includeAvailability: formState.includeAvailability,
        includePrice: formState.includePrice,
      }),
    );

    console.log(formData)
    submit(formData, { method: "post" });
  }, [formState, submit]);

  return {
    formState,
    setField,
    submit: handleSubmit,
  };
}

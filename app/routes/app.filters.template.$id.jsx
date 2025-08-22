import {
  Page,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getAllCollections, getAllFilters, saveTemplate, } from "../models/templates.server";
import { useActionData, useNavigate, useNavigation, useLoaderData, redirect  } from "@remix-run/react";
import { TemplateForm } from "../components/TemplateForm/TemplateForm";

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const collections = await getAllCollections(admin.graphql);
  const filters = await getAllFilters(admin.graphql);

  let initialData;

  if (params.id === '0') {
    console.log('new')
    initialData = {
        title: "",
        collectionIds: [],
        filtersIds: []
    };

  } else  {
    // initialData
  }
 
  return {initialData, collections, filters};
}

export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const templateData = formData.get('template');
  if (!templateData || typeof templateData !== "string")
    throw new Error("No template data provided");


  console.log('templateData', templateData)

  const result = await saveTemplate(admin.graphql, params.id,  templateData);

  if (result.errors?.length > 0) {
      return { errors: result.errors };
  }

  return redirect("/app/filters/templates");

}

export default function FiltersTemplatesForm() {
  const { initialData, collections, filters } = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'submitting';
  const actionData = useActionData();
  const submitErrors = actionData?.errors || [];
  const navigate = useNavigate();



    return (
        <Page>
            <ui-title-bar title="Crear">
                <button variant="breadcrumb" onClick={() => navigate("/app/filters/templates")}>
                    Plantillas de filtros
                </button>
            </ui-title-bar>

            <TemplateForm
                initialData={initialData}
                collections={collections}
                filters={filters}
                isLoading={isLoading}
                submitErrors={submitErrors}
                success={actionData?.success}
            />
        </Page>
    );
}
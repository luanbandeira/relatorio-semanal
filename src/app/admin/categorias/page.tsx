import { requireRole } from "@/lib/auth";
import { getCategories } from "@/lib/queries";
import { CategoryEditor } from "./category-editor";

export default async function CategoriesPage() {
  const viewer = await requireRole(["admin"]);
  const categories = await getCategories(viewer.supabase, true);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Categorias</h1>
      <p className="text-sm text-muted-foreground">
        Categorias desativadas deixam de aparecer para novos gastos, mas continuam nos registros e totais anteriores. O grupo
        define a apresentação (percurso ou outras despesas) e pode ser ajustado em cada gasto.
      </p>
      <CategoryEditor categories={categories} />
    </div>
  );
}

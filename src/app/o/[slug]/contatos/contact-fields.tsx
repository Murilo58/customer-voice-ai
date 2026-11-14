import { Field } from "@/app/ui/primitives";

/** Campos do formulário de contato (criação e edição). */
export function ContactFields({ companies, values }: {
  companies: { id: string; name: string }[];
  values?: { name: string; email: string; phone: string | null; clientCompanyId: string | null };
}) {
  return (
    <div className="form-grid">
      <Field id="name" label="Nome">
        <input id="name" name="name" required minLength={2} maxLength={120} defaultValue={values?.name} />
      </Field>
      <Field id="email" label="E-mail">
        <input id="email" name="email" type="email" required maxLength={254} defaultValue={values?.email} />
      </Field>
      <Field id="phone" label="Telefone (opcional)">
        <input id="phone" name="phone" maxLength={30} defaultValue={values?.phone ?? ""} />
      </Field>
      <Field id="company_id" label="Empresa-cliente (opcional)">
        <select id="company_id" name="company_id" defaultValue={values?.clientCompanyId ?? ""}>
          <option value="">Nenhuma</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
    </div>
  );
}

/** Campos do formulário de contato (criação e edição). */
export function ContactFields({ companies, values }: {
  companies: { id: string; name: string }[];
  values?: { name: string; email: string; phone: string | null; clientCompanyId: string | null };
}) {
  return (
    <>
      <label htmlFor="name">Nome</label>
      <input id="name" name="name" required minLength={2} maxLength={120} defaultValue={values?.name} />
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" required maxLength={254} defaultValue={values?.email} />
      <label htmlFor="phone">Telefone (opcional)</label>
      <input id="phone" name="phone" maxLength={30} defaultValue={values?.phone ?? ""} />
      <label htmlFor="company_id">Empresa-cliente (opcional)</label>
      <select id="company_id" name="company_id" defaultValue={values?.clientCompanyId ?? ""}>
        <option value="">Nenhuma</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </>
  );
}

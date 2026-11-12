import { consumeMagicLinkAction } from "@/app/actions/portal";

// Confirmação do link mágico por botão: o acesso só é consumido no envio do formulário (CA-07.1).
export default async function PortalAccess({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  return (
    <section className="card portal-narrow">
      <h1>Acessar meus chamados</h1>
      <p className="muted">Clique para entrar. Por segurança, o link funciona uma única vez.</p>
      <form action={consumeMagicLinkAction.bind(null, slug, token)}>
        <button type="submit" className="btn btn-primary btn-block">Entrar</button>
      </form>
    </section>
  );
}

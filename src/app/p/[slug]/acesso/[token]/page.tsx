import { consumeMagicLinkAction } from "@/app/actions/portal";

// Confirmação do link mágico por botão: o acesso só é consumido no envio do formulário (CA-07.1).
export default async function PortalAccess({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  return (
    <>
      <h1>Acessar meus chamados</h1>
      <form className="card" action={consumeMagicLinkAction.bind(null, slug, token)}>
        <p>Clique para entrar. O link funciona uma única vez.</p>
        <button type="submit">Entrar</button>
      </form>
    </>
  );
}

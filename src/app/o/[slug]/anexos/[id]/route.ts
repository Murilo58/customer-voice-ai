import { downloadForMember, downloadResponse } from "@/server/attachments/service";
import { getSessionUser } from "@/server/identity/session";
import { resolveActor } from "@/server/organizations/service";
import { DomainError, ForbiddenError } from "@/server/errors";

// Download autenticado para a equipe (RSG-18; CA-10.8): sessão + vínculo + permissão; só anexos liberados.
// Qualquer recusa responde 404, sem revelar a existência do arquivo nem o caminho no armazenamento.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const user = await getSessionUser();
  const actor = user ? await resolveActor(user.id, slug) : null;
  if (!actor) return new Response("Not Found", { status: 404 });
  try {
    return downloadResponse(await downloadForMember(actor, id));
  } catch (e) {
    if (e instanceof DomainError || e instanceof ForbiddenError) return new Response("Not Found", { status: 404 });
    throw e;
  }
}

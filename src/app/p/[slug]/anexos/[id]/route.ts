import { cookies } from "next/headers";
import { downloadForContact, downloadResponse } from "@/server/attachments/service";
import { DomainError } from "@/server/errors";
import { getPortalSession, PORTAL_COOKIE } from "@/server/portal/service";

// Download pelo portal (RSG-18; CA-10.8): sessão válida do contato, chamado dele, mensagem pública ou abertura.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await getPortalSession(slug, (await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) return new Response("Not Found", { status: 404 });
  try {
    return downloadResponse(await downloadForContact(session.organization.id, session.contactIds, id));
  } catch (e) {
    if (e instanceof DomainError) return new Response("Not Found", { status: 404 });
    throw e;
  }
}

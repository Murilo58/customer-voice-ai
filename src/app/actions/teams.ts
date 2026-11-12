"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/server/identity/session";
import { updateOrganizationSettings } from "@/server/organizations/service";
import { confirmInboundEmail } from "@/server/organizations/onboarding";
import { addTeamMember, createTeam, removeTeamMember, renameTeam, setTeamArchived } from "@/server/organizations/teams";
import { backWithError, field } from "./helpers";

const teamsPath = (slug: string) => `/o/${slug}/equipes`;

export async function createTeamAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await createTeam(actor, field(form, "name"));
  } catch (e) {
    backWithError(teamsPath(slug), e);
  }
  redirect(teamsPath(slug));
}

export async function renameTeamAction(slug: string, teamId: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await renameTeam(actor, teamId, field(form, "name"));
  } catch (e) {
    backWithError(teamsPath(slug), e);
  }
  redirect(teamsPath(slug));
}

export async function setTeamArchivedAction(slug: string, teamId: string, archived: boolean): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await setTeamArchived(actor, teamId, archived);
  } catch (e) {
    backWithError(teamsPath(slug), e);
  }
  redirect(teamsPath(slug));
}

export async function addTeamMemberAction(slug: string, teamId: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await addTeamMember(actor, teamId, field(form, "membership_id"));
  } catch (e) {
    backWithError(teamsPath(slug), e);
  }
  redirect(teamsPath(slug));
}

export async function removeTeamMemberAction(slug: string, teamId: string, membershipId: string): Promise<void> {
  const { actor } = await requireActor(slug);
  try {
    await removeTeamMember(actor, teamId, membershipId);
  } catch (e) {
    backWithError(teamsPath(slug), e);
  }
  redirect(teamsPath(slug));
}

export async function updateOrganizationAction(slug: string, form: FormData): Promise<void> {
  const { actor } = await requireActor(slug);
  const back = `/o/${slug}/configuracoes`;
  try {
    await updateOrganizationSettings(actor, { name: field(form, "name"), timezone: field(form, "timezone") });
  } catch (e) {
    backWithError(back, e);
  }
  redirect(`${back}?ok=organizacao`);
}

export async function confirmInboundEmailAction(slug: string): Promise<void> {
  const { actor } = await requireActor(slug);
  const back = `/o/${slug}/configuracoes`;
  try {
    await confirmInboundEmail(actor);
  } catch (e) {
    backWithError(back, e);
  }
  redirect(`${back}?ok=email#email`);
}

"use client";

import { useRef, useState } from "react";
import { AttachmentInput } from "@/app/attachments";
import { Icon } from "@/app/ui/icons";

type Mode = "reply" | "note";

/**
 * Campo de resposta com abas "Resposta pública / Nota interna" (padrão ARIA de abas). Cada aba é um formulário
 * próprio, com a mesma server action de antes; trocar de aba não descarta o texto da outra.
 */
export function Composer({ replyAction, noteAction, replyable }: {
  replyAction: (form: FormData) => Promise<void>;
  noteAction: (form: FormData) => Promise<void>;
  /** Chamado aceita resposta pública (não resolvido/fechado/cancelado). Sem isso, só a nota interna. */
  replyable: boolean;
}) {
  const [mode, setMode] = useState<Mode>(replyable ? "reply" : "note");
  const tabs = useRef<Record<Mode, HTMLButtonElement | null>>({ reply: null, note: null });
  const modes: Mode[] = replyable ? ["reply", "note"] : ["note"];

  function onKey(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || modes.length < 2) return;
    e.preventDefault();
    const next: Mode = e.key === "Home" ? modes[0]! : e.key === "End" ? modes[modes.length - 1]! : mode === "reply" ? "note" : "reply";
    setMode(next);
    tabs.current[next]?.focus();
  }

  const tab = (m: Mode, label: string, icon: "mail" | "lock") => (
    <button
      key={m}
      ref={(el) => { tabs.current[m] = el; }}
      type="button"
      role="tab"
      id={`tab-${m}`}
      aria-controls={`panel-${m}`}
      aria-selected={mode === m}
      tabIndex={mode === m ? 0 : -1}
      className={`composer-tab composer-tab-${m}`}
      onClick={() => setMode(m)}
    >
      <Icon name={icon} />{label}
    </button>
  );

  return (
    <div className={`composer-box composer-${mode}`}>
      <div role="tablist" aria-label="Tipo de mensagem" className="composer-tabs" onKeyDown={onKey}>
        {replyable && tab("reply", "Resposta pública", "mail")}
        {tab("note", "Nota interna", "lock")}
      </div>

      {replyable && (
        <form id="panel-reply" role="tabpanel" aria-labelledby="tab-reply" hidden={mode !== "reply"} action={replyAction} className="composer-panel">
          <label htmlFor="reply" className="sr-only">Resposta pública</label>
          <textarea id="reply" name="body" required maxLength={20000} rows={5} placeholder="Escreva a resposta ao cliente…" aria-describedby="reply-hint" />
          <p id="reply-hint" className="composer-hint"><Icon name="mail" />Enviada por e-mail ao contato e visível no portal.</p>
          <AttachmentInput id="reply-attachments" />
          <div className="composer-actions">
            <button type="submit" className="btn btn-primary">Enviar resposta</button>
          </div>
        </form>
      )}

      <form id="panel-note" role="tabpanel" aria-labelledby="tab-note" hidden={mode !== "note"} action={noteAction} className="composer-panel">
        <label htmlFor="body" className="sr-only">Nota interna</label>
        <textarea id="body" name="body" required maxLength={20000} rows={5} placeholder="Registre uma observação para a equipe…" aria-describedby="note-hint" />
        <p id="note-hint" className="composer-hint"><Icon name="lock" />Nunca visível ao cliente.</p>
        <AttachmentInput id="note-attachments" />
        <div className="composer-actions">
          <button type="submit" className="btn btn-note">Adicionar nota interna</button>
        </div>
      </form>
    </div>
  );
}

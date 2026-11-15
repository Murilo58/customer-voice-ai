"use client";

import { useActionState, useState } from "react";
import { confirmTwoFactorAction, enableTwoFactorAction, type TwoFactorConfirmState, type TwoFactorSetupState } from "@/app/actions/auth";
import { messageFor } from "@/lib/messages";
import { Icon } from "@/app/ui/icons";
import { PasswordInput } from "@/app/ui/password-input";
import { btn } from "@/app/ui/primitives";

/**
 * Ativação do 2FA em etapas: senha -> QR Code (chave manual oculta) -> código de 6 dígitos -> códigos de recuperação.
 * Fica montado também depois da ativação (enabled) para manter os códigos na tela até o usuário concluir.
 */
export function TwoFactorSetup({ enabled }: { enabled: boolean }) {
  const [started, setStarted] = useState(false);
  const [setup, startAction, starting] = useActionState<TwoFactorSetupState, FormData>(enableTwoFactorAction, {});
  const [confirm, confirmAction, confirming] = useActionState<TwoFactorConfirmState, FormData>(confirmTwoFactorAction, {});

  if (confirm.backupCodes) return <RecoveryCodes codes={confirm.backupCodes} />;
  if (enabled) {
    return (
      <p className="all-clear">
        <Icon name="check" />
        Sua conta exige um código do aplicativo autenticador ao entrar.
      </p>
    );
  }

  if (setup.qrSvg && setup.manualKey) {
    return (
      <div className="tfa-steps">
        <h3 className="tfa-title">1. Leia o QR Code</h3>
        <p className="muted">Abra o aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy ou similar) e leia o código abaixo.</p>
        <div className="tfa-qr" role="img" aria-label="QR Code para cadastrar o VoxDesk AI no aplicativo autenticador" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
        <ManualKey value={setup.manualKey} />
        <h3 className="tfa-title">2. Informe o código gerado</h3>
        <form action={confirmAction} noValidate>
          {confirm.error && <p className="alert" role="alert">{messageFor(confirm.error)}</p>}
          <label htmlFor="code">Código de 6 dígitos</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="000000"
            className="tfa-code"
            required
          />
          <div className="tfa-actions">
            <button type="submit" className={btn()} disabled={confirming}>{confirming ? "Confirmando…" : "Confirmar ativação"}</button>
          </div>
        </form>
        {confirm.error === "mfa_setup_expired" && (
          <button type="button" className={btn("secondary")} onClick={() => window.location.reload()}>Recomeçar</button>
        )}
      </div>
    );
  }

  if (!started) {
    return (
      <button type="button" className={btn()} onClick={() => setStarted(true)}>
        <Icon name="shield" />
        Ativar autenticação em duas etapas
      </button>
    );
  }

  return (
    <form action={startAction}>
      {setup.error && <p className="alert" role="alert">{messageFor(setup.error)}</p>}
      <label htmlFor="password">Confirme sua senha para continuar</label>
      <PasswordInput id="password" name="password" autoComplete="current-password" required />
      <div className="tfa-actions">
        <button type="submit" className={btn()} disabled={starting}>{starting ? "Gerando QR Code…" : "Continuar"}</button>
        <button type="button" className={btn("ghost")} onClick={() => setStarted(false)}>Cancelar</button>
      </div>
    </form>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  };
  return { copied, copy };
}

function ManualKey({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const { copied, copy } = useCopy();
  if (!open) {
    return (
      <button type="button" className={`${btn("ghost", "sm")} tfa-link`} onClick={() => setOpen(true)} aria-expanded={false}>
        Não consegue ler o QR Code? Inserir chave manualmente
      </button>
    );
  }
  return (
    <div className="tfa-manual">
      <p className="muted">No aplicativo, escolha &quot;Inserir chave&quot; (tipo: baseada em tempo) e digite a chave abaixo.</p>
      <div className="tfa-key-row">
        <code className="tfa-key" aria-label={visible ? "Chave do autenticador" : "Chave oculta"}>
          {visible ? value : value.replace(/[A-Z2-7]/g, "•")}
        </code>
        <button type="button" className={btn("secondary", "sm")} onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
          <Icon name={visible ? "eyeOff" : "eye"} />
          {visible ? "Ocultar" : "Mostrar"}
        </button>
        <button type="button" className={btn("secondary", "sm")} onClick={() => copy("key", value.replace(/\s/g, ""))}>
          {copied === "key" ? "Copiada" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [saved, setSaved] = useState(false);
  const { copied, copy } = useCopy();
  const text = `VoxDesk AI — códigos de recuperação\nCada código pode ser usado uma única vez.\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "voxdesk-codigos-de-recuperacao.txt" });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="tfa-steps">
      <p className="all-clear">
        <Icon name="check" />
        Autenticação em duas etapas ativada.
      </p>
      <h3 className="tfa-title">3. Guarde seus códigos de recuperação</h3>
      <p>
        Se você perder o acesso ao aplicativo autenticador, use um destes códigos para entrar. Cada código vale uma única vez.
        <strong> Eles não serão exibidos novamente.</strong>
      </p>
      <p className="muted">Guarde-os em local seguro, como um gerenciador de senhas. Não os envie por e-mail nem tire captura de tela.</p>
      <ul className="tfa-codes" aria-label="Códigos de recuperação">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <div className="tfa-actions">
        <button type="button" className={btn("secondary")} onClick={() => copy("codes", codes.join("\n"))}>
          {copied === "codes" ? "Códigos copiados" : "Copiar códigos"}
        </button>
        <button type="button" className={btn("secondary")} onClick={download}>Baixar arquivo .txt</button>
      </div>
      <label className="tfa-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Guardei os códigos de recuperação em local seguro.
      </label>
      <button type="button" className={btn()} disabled={!saved} onClick={() => window.location.assign("/conta/seguranca?ok=1")}>
        Concluir
      </button>
    </div>
  );
}

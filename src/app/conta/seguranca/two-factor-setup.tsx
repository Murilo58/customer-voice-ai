"use client";

import { useActionState } from "react";
import { confirmTwoFactorAction, enableTwoFactorAction, type TwoFactorSetupState } from "@/app/actions/auth";
import { messageFor } from "@/lib/messages";

export function TwoFactorSetup() {
  const [state, action, pending] = useActionState<TwoFactorSetupState, FormData>(enableTwoFactorAction, {});
  if (state.totpURI) {
    return (
      <>
        <p>Cadastre esta chave no aplicativo autenticador (copie o endereço abaixo) e informe o código gerado:</p>
        <p><code>{state.totpURI}</code></p>
        {state.backupCodes && (
          <>
            <p>Guarde os códigos de recuperação em local seguro. Eles não serão exibidos novamente:</p>
            <p><code>{state.backupCodes.join("  ")}</code></p>
          </>
        )}
        <form action={confirmTwoFactorAction}>
          <label htmlFor="code">Código de 6 dígitos</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
          <button type="submit">Confirmar</button>
        </form>
      </>
    );
  }
  return (
    <form action={action}>
      {state.error && <p className="alert" role="alert">{messageFor(state.error)}</p>}
      <label htmlFor="password">Confirme sua senha para iniciar</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit" disabled={pending}>Ativar</button>
    </form>
  );
}

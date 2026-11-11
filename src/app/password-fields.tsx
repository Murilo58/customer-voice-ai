/** Campos de criação de conta por convite. */
export function PasswordFields() {
  return (
    <>
      <label htmlFor="name">Seu nome</label>
      <input id="name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
      <label htmlFor="password">Senha (mínimo 12 caracteres)</label>
      <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <label htmlFor="password_confirm">Confirme a senha</label>
      <input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" required />
    </>
  );
}

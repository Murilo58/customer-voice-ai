/** Avaliação de 1 a 5 com comentário opcional (RF-POR-05). */
export function CsatForm({ action }: { action: (form: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <fieldset className="scale">
        <legend>Como você avalia o atendimento? (1 = muito insatisfeito, 5 = muito satisfeito)</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n}>
            <input type="radio" name="score" value={n} required /> {n}
          </label>
        ))}
      </fieldset>
      <label htmlFor="comment">Comentário (opcional)</label>
      <textarea id="comment" name="comment" maxLength={1000} rows={3} />
      <button type="submit">Enviar avaliação</button>
    </form>
  );
}

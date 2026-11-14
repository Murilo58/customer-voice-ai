const SCALE = ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"];

/** Avaliação de 1 a 5 com comentário opcional (RF-POR-05). Rádios nativos, exibidos como botões. */
export function CsatForm({ action }: { action: (form: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <fieldset className="scale">
        <legend>Como você avalia o atendimento?</legend>
        <div className="scale-options">
          {SCALE.map((label, i) => (
            <label key={label} className="scale-option">
              <input type="radio" name="score" value={i + 1} required />
              <span className="scale-num">{i + 1}</span>
              <span className="scale-label">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="comment">Comentário (opcional)</label>
      <textarea id="comment" name="comment" maxLength={1000} rows={3} />
      <div className="portal-actions"><button type="submit" className="btn btn-primary">Enviar avaliação</button></div>
    </form>
  );
}

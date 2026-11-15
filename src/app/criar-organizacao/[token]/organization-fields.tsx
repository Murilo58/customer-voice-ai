"use client";

import { useEffect, useRef, useState } from "react";
import { slugify, slugifyTyping, slugProblem } from "@/lib/slug";

/**
 * Nome e identificador da organização. O identificador é sugerido a partir do nome até o usuário editá-lo;
 * a validação do navegador usa mensagens em português (o servidor revalida com as mesmas regras).
 */
export function OrganizationFields({ defaultName = "", defaultSlug = "" }: { defaultName?: string; defaultSlug?: string }) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(defaultSlug || slugify(defaultName));
  const [edited, setEdited] = useState(Boolean(defaultSlug));
  const [touched, setTouched] = useState(Boolean(defaultSlug));
  const slugRef = useRef<HTMLInputElement>(null);
  const problem = slugProblem(slug);

  useEffect(() => {
    slugRef.current?.setCustomValidity(problem ?? "");
  }, [problem]);

  return (
    <>
      <label htmlFor="org_name">Nome da organização</label>
      <input
        id="org_name"
        name="org_name"
        required
        minLength={2}
        maxLength={120}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!edited) setSlug(slugify(e.target.value));
        }}
        onInvalid={(e) => e.currentTarget.setCustomValidity(e.currentTarget.value.trim().length < 2 ? "Informe o nome da organização (mínimo 2 caracteres)." : "")}
        onInput={(e) => e.currentTarget.setCustomValidity("")}
      />
      <label htmlFor="slug">Identificador (usado no endereço)</label>
      <input
        ref={slugRef}
        id="slug"
        name="slug"
        required
        maxLength={48}
        placeholder="minha-empresa"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby="slug-hint"
        value={slug}
        onChange={(e) => {
          const v = slugifyTyping(e.target.value);
          setSlug(v);
          setEdited(v !== "");
          setTouched(true);
        }}
        onBlur={() => setSlug((v) => slugify(v))}
      />
      <p id="slug-hint" className="field-hint" aria-live="polite">
        {(slug || touched) && problem ? problem : slug ? `Endereço da organização: /o/${slug}` : "Sugerido a partir do nome. Letras sem acento, números e hífens."}
      </p>
    </>
  );
}

"use client";

import { useState } from "react";
import { Icon } from "./icons";

/** Campo de senha com botão para mostrar/ocultar. Mantém id, name e atributos do campo original. */
export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { id: string; name: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        aria-controls={props.id}
        aria-pressed={visible}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

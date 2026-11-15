import Link from "next/link";

/** Marca do produto: símbolo + nome. Usada na landing page, nas telas de acesso e no menu lateral. */
export function Brand({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`brand ${className}`.trim()}>
      <span className="brand-mark" aria-hidden="true">VD</span>
      <span className="brand-name">VoxDesk AI</span>
    </Link>
  );
}

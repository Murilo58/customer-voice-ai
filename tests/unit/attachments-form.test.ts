import { describe, expect, it } from "vitest";
import { filesFromForm, prepareFiles } from "@/server/attachments/service";

// Regressão: resposta pública sem anexo exibia "undefined 1 KB — recusado (tipo não permitido)".
// O campo de arquivo vazio chegava à server action como File de 0 bytes chamado "undefined".

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function form(...files: File[]): FormData {
  const f = new FormData();
  f.set("body", "Resposta ao cliente.");
  for (const file of files) f.append("attachments", file);
  return f;
}

describe("anexos do formulário", () => {
  it("ignora o campo de arquivo vazio como chega na server action (nome \"undefined\", 0 bytes)", async () => {
    const empty = new File([], undefined as unknown as string, { type: "application/octet-stream" });
    expect(empty.name).toBe("undefined");
    expect(await filesFromForm(form(empty))).toEqual([]);
  });

  it("ignora o campo de arquivo vazio enviado pelo navegador (nome vazio, 0 bytes)", async () => {
    expect(await filesFromForm(form(new File([], "")))).toEqual([]);
    expect(await filesFromForm(new FormData())).toEqual([]);
  });

  it("mantém nome, tamanho e tipo de um arquivo válido", async () => {
    const files = await filesFromForm(form(new File([PNG], "print.png", { type: "image/png" })));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "print.png", size: PNG.length, declaredType: "image/png" });
    const [p] = prepareFiles(files);
    expect(p).toMatchObject({ name: "print.png", size: PNG.length, kind: "png" });
    expect(p!.rejected).toBeUndefined();
  });

  it("um arquivo de fato escolhido e não permitido continua recusado com o nome real e motivo claro", async () => {
    const files = await filesFromForm(form(new File([Buffer.from("x")], "desenho.bmp")));
    const [p] = prepareFiles(files);
    expect(p).toMatchObject({ name: "desenho.bmp", rejected: "type_not_allowed" });
  });

  it("um arquivo vazio com nome real continua sendo recusado como vazio", async () => {
    const [p] = prepareFiles(await filesFromForm(form(new File([], "notas.txt"))));
    expect(p).toMatchObject({ name: "notas.txt", rejected: "empty" });
  });
});

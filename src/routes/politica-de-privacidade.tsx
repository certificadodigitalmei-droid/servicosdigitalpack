import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Central MEI Digital" },
      { name: "description", content: "Como a Central MEI Digital trata dados pessoais." },
    ],
  }),
  component: () => (
    <LegalPage title="Política de Privacidade">
      <p>
        A Central MEI Digital respeita a privacidade dos usuários e trata dados pessoais em
        conformidade com a Lei Geral de Proteção de Dados (LGPD).
      </p>
      <p>
        Coletamos apenas os dados necessários para prestação do serviço privado contratado, como
        nome, documento, e-mail e telefone. Os dados públicos exibidos são obtidos de bases
        oficiais gratuitas de consulta a CNPJ.
      </p>
      <p>
        <strong>Encarregado de dados:</strong> <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em>
      </p>
    </LegalPage>
  ),
});

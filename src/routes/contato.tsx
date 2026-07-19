import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — Central MEI Digital" },
      { name: "description", content: "Canais de atendimento da Central MEI Digital." },
    ],
  }),
  component: () => (
    <LegalPage title="Contato">
      <p>
        Estamos disponíveis para tirar dúvidas sobre o serviço privado de apoio digital ao
        microempreendedor.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>E-mail: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></li>
        <li>Telefone: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></li>
        <li>Endereço: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em></li>
      </ul>
    </LegalPage>
  ),
});

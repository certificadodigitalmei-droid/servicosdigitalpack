import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/termos-de-uso")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Central MEI Digital" },
      { name: "description", content: "Termos de uso do serviço privado da Central MEI Digital." },
    ],
  }),
  component: () => (
    <LegalPage title="Termos de Uso">
      <p>
        A Central MEI Digital é uma empresa privada e não possui vínculo com a Receita Federal,
        Gov.br, Portal do Empreendedor ou qualquer órgão público. A contratação do serviço é
        opcional.
      </p>
      <p>
        Ao contratar o serviço, o usuário declara estar ciente de que se trata de um apoio
        digital privado e opcional, cujas obrigações fiscais oficiais devem ser cumpridas pelos
        canais governamentais gratuitos.
      </p>
    </LegalPage>
  ),
});

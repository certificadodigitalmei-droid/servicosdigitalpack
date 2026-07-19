import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/quem-somos")({
  head: () => ({
    meta: [
      { title: "Quem Somos — Central MEI Digital" },
      { name: "description", content: "Sobre a Central MEI Digital." },
    ],
  }),
  component: () => (
    <LegalPage title="Quem Somos">
      <p>
        A Central MEI Digital é uma empresa privada dedicada a oferecer serviços opcionais de
        apoio digital, organização documental e suporte para microempreendedores individuais.
      </p>
      <p>
        Não somos órgão público e não representamos nenhuma entidade governamental. Nosso serviço
        é complementar aos canais oficiais gratuitos.
      </p>
    </LegalPage>
  ),
});

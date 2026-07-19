import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/politica-de-reembolso")({
  head: () => ({
    meta: [
      { title: "Política de Reembolso — Central MEI Digital" },
      { name: "description", content: "Regras de reembolso do serviço privado." },
    ],
  }),
  component: () => (
    <LegalPage title="Política de Reembolso">
      <p>
        Nos termos do Código de Defesa do Consumidor, o usuário pode solicitar o reembolso
        integral em até 7 dias corridos após a contratação, mediante solicitação pelos canais de
        contato.
      </p>
      <p>
        Prazos de processamento bancário: <em>INFORMAÇÃO PENDENTE DE CONFIGURAÇÃO</em>.
      </p>
    </LegalPage>
  ),
});

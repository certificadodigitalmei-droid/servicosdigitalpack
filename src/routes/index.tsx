import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const TARGET = "https://www.gov.br/pt-br";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Portal do Empreendedor — Certificado Digital MEI" },
      { name: "robots", content: "noindex" },
      { httpEquiv: "refresh", content: `0; url=${TARGET}` },
    ],
  }),
  component: RedirectHome,
});

function RedirectHome() {
  useEffect(() => {
    window.location.replace(TARGET);
  }, []);
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      Redirecionando para <a href={TARGET}>{TARGET}</a>…
    </div>
  );
}

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/painel/empresas-importadas')({
  component: () => <Outlet />,
});

import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/_authenticated/painel/campanhas-email')({
  component: CampanhasEmail,
});

function CampanhasEmail() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-brand-navy">Campanhas de E-mail</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova Campanha</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Em construção: Aba de montagem de campanhas.</p>
        </CardContent>
      </Card>
    </div>
  );
}

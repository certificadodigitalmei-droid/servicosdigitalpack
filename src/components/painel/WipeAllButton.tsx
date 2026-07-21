import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export type WipeStep = {
  label: string;
  run: () => PromiseLike<{ error: { message: string } | null }>;
};

type Props = {
  label: string;
  title: string;
  description: string;
  steps: WipeStep[];
  onDone?: () => void | Promise<void>;
  disabled?: boolean;
  size?: 'default' | 'sm';
};

export function WipeAllButton({
  label,
  title,
  description,
  steps,
  onDone,
  disabled,
  size = 'default',
}: Props) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const execute = async () => {
    setRunning(true);
    try {
      for (const s of steps) {
        const { error } = await s.run();
        if (error) throw new Error(`${s.label}: ${error.message}`);
      }
      toast.success('Apagado com sucesso');
      setOpen(false);
      await onDone?.();
    } catch (err: any) {
      toast.error(`Erro ao apagar: ${err.message}`);
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size={size}
          disabled={disabled}
          className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="mr-2 h-4 w-4" /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void execute();
            }}
            disabled={running}
            className="bg-red-600 hover:bg-red-700"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Apagando...
              </>
            ) : (
              'Apagar tudo'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

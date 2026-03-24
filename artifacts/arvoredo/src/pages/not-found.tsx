import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui-elements";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="bg-card p-8 rounded-2xl shadow-lg border border-border text-center max-w-md w-full">
        <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-2">Página não encontrada</h1>
        <p className="text-muted-foreground mb-8">
          A página que você está procurando não existe ou foi movida.
        </p>
        <Link href="/">
          <Button size="lg" className="w-full">
            Voltar para o Início
          </Button>
        </Link>
      </div>
    </div>
  );
}

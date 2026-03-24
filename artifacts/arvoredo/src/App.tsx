import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "@/components/layout";
import Pdv from "@/pages/pdv";
import Estoque from "@/pages/estoque";
import Fiado from "@/pages/fiado";
import Caixa from "@/pages/caixa";
import Historico from "@/pages/historico";
import Produtos from "@/pages/produtos";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    }
  }
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Pdv} />
        <Route path="/estoque" component={Estoque} />
        <Route path="/fiado" component={Fiado} />
        <Route path="/caixa" component={Caixa} />
        <Route path="/historico" component={Historico} />
        <Route path="/produtos" component={Produtos} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;

import React, { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ShoppingCart,
  Package,
  Users,
  Wallet,
  Activity,
  Box,
  TreePine,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProdutosAlertas } from "@/hooks/use-produtos";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { data: alertas } = useProdutosAlertas();
  const alertCount = alertas?.length || 0;

  const navItems = [
    { name: "PDV / Caixa", href: "/", icon: ShoppingCart },
    { name: "Estoque", href: "/estoque", icon: Box, badge: alertCount },
    { name: "Fiado", href: "/fiado", icon: Users },
    { name: "Sessão Caixa", href: "/caixa", icon: Wallet },
    { name: "Histórico", href: "/historico", icon: Activity },
    { name: "Produtos", href: "/produtos", icon: Package },
    { name: "Dispositivos", href: "/dispositivos", icon: Cpu },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-r border-border flex-shrink-0 z-10 sticky top-0 md:h-screen md:overflow-y-auto">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-xl">
            <TreePine className="w-6 h-6" />
          </div>
          <span className="font-bold text-xl tracking-tight text-foreground">
            Arvoredo
          </span>
        </div>

        <nav className="px-4 pb-6 space-y-1 overflow-x-auto md:overflow-visible flex md:flex-col items-center md:items-stretch hide-scrollbar">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group flex-shrink-0 md:flex-shrink",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "w-5 h-5 transition-transform duration-200",
                    isActive ? "" : "group-hover:scale-110"
                  )}
                />
                <span className="font-medium whitespace-nowrap">{item.name}</span>
                {!!item.badge && (
                  <span
                    className={cn(
                      "ml-auto text-xs font-bold px-2 py-0.5 rounded-full",
                      isActive
                        ? "bg-white text-destructive"
                        : "bg-destructive text-destructive-foreground"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-[calc(100vh-80px)] md:h-screen overflow-hidden">
        {children}
      </main>
    </div>
  );
}

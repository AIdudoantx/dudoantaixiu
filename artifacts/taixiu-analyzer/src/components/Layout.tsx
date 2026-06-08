import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { Activity, LayoutDashboard, History, GitGraph, Settings, Sparkles, Bot } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/history", icon: History, label: "History" },
    { href: "/pattern", icon: GitGraph, label: "Pattern" },
    { href: "/prediction", icon: Sparkles, label: "Dự Đoán 3 Phương Pháp" },
    { href: "/telegram", icon: Bot, label: "Bot Telegram" },
    { href: "/settings", icon: Settings, label: "Cài Đặt" },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-16 flex-col items-center border-r border-border/50 bg-card/50 flex py-4 shrink-0 hidden md:flex">
        <div className="mb-8 p-2 rounded-xl bg-primary/20 text-primary">
          <Activity size={24} className="animate-pulse" />
        </div>
        
        <nav className="flex flex-col gap-4 flex-1 w-full items-center">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "p-3 rounded-xl transition-all duration-200 relative group",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon size={20} />
                    {isActive && (
                      <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-primary rounded-r-md" />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-mono text-xs ml-2">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-2 text-primary font-mono font-bold">
            <Activity size={20} className="animate-pulse" />
            <span>TX ANALYZER</span>
          </div>
          <div className="flex gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  location === item.href 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground bg-muted"
                )}
              >
                <item.icon size={18} />
              </Link>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-background/95 backdrop-blur-3xl relative">
          {/* Subtle grid background */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          
          <div className="relative z-10 p-4 md:p-8 max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
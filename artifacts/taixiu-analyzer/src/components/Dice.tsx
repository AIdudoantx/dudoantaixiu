import React from "react";
import { cn } from "@/lib/utils";

interface DiceProps {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Dice({ value, size = "md", className }: DiceProps) {
  // Ensure value is between 1 and 6
  const normalizedValue = Math.max(1, Math.min(6, Math.floor(value || 1)));

  const sizeClasses = {
    sm: "w-6 h-6 rounded-md p-1",
    md: "w-10 h-10 rounded-lg p-1.5",
    lg: "w-16 h-16 rounded-xl p-3",
  };

  const dotSizeClasses = {
    sm: "w-1 h-1",
    md: "w-2 h-2",
    lg: "w-3 h-3",
  };

  const Dot = () => (
    <div className={cn("bg-current rounded-full shadow-[inset_0_-1px_2px_rgba(0,0,0,0.5)]", dotSizeClasses[size])} />
  );

  return (
    <div
      className={cn(
        "bg-white text-gray-900 border-b-2 border-r-2 border-gray-300 shadow-sm relative overflow-hidden",
        sizeClasses[size],
        className
      )}
      data-testid={`dice-${normalizedValue}`}
    >
      {/* Glossy overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent pointer-events-none" />
      
      <div className="w-full h-full relative z-10">
        {normalizedValue === 1 && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive">
            <div className={cn("bg-current rounded-full shadow-[inset_0_-1px_2px_rgba(0,0,0,0.5)]", 
              size === "sm" ? "w-2 h-2" : size === "md" ? "w-3 h-3" : "w-5 h-5")} />
          </div>
        )}
        
        {normalizedValue === 2 && (
          <>
            <div className="absolute top-0 right-0"><Dot /></div>
            <div className="absolute bottom-0 left-0"><Dot /></div>
          </>
        )}
        
        {normalizedValue === 3 && (
          <>
            <div className="absolute top-0 right-0"><Dot /></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><Dot /></div>
            <div className="absolute bottom-0 left-0"><Dot /></div>
          </>
        )}
        
        {normalizedValue === 4 && (
          <div className="grid grid-cols-2 grid-rows-2 h-full w-full gap-0 place-items-center">
            <div className="flex w-full h-full justify-start items-start"><Dot /></div>
            <div className="flex w-full h-full justify-end items-start"><Dot /></div>
            <div className="flex w-full h-full justify-start items-end"><Dot /></div>
            <div className="flex w-full h-full justify-end items-end"><Dot /></div>
          </div>
        )}
        
        {normalizedValue === 5 && (
          <div className="relative w-full h-full">
            <div className="absolute top-0 left-0"><Dot /></div>
            <div className="absolute top-0 right-0"><Dot /></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><Dot /></div>
            <div className="absolute bottom-0 left-0"><Dot /></div>
            <div className="absolute bottom-0 right-0"><Dot /></div>
          </div>
        )}
        
        {normalizedValue === 6 && (
          <div className="grid grid-cols-2 grid-rows-3 h-full w-full gap-0 place-items-center">
            <div className="flex w-full h-full justify-start items-start"><Dot /></div>
            <div className="flex w-full h-full justify-end items-start"><Dot /></div>
            <div className="flex w-full h-full justify-start items-center"><Dot /></div>
            <div className="flex w-full h-full justify-end items-center"><Dot /></div>
            <div className="flex w-full h-full justify-start items-end"><Dot /></div>
            <div className="flex w-full h-full justify-end items-end"><Dot /></div>
          </div>
        )}
      </div>
    </div>
  );
}
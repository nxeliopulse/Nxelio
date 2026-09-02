"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightIcon, label, placeholder, error, ...props }, ref) => {
    const hasLabel = Boolean(label);
    return (
      <div className="relative w-full">
        {leftIcon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 flex items-center justify-center">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          suppressHydrationWarning
          placeholder={hasLabel ? " " : placeholder}
          className={cn(
            "peer w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1b212e] px-3 text-sm text-slate-900 dark:text-white transition",
            "placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-600/35 focus:border-indigo-600",
            "hover:border-slate-300 dark:hover:border-slate-600",
            "disabled:opacity-50 disabled:bg-slate-50/50 disabled:hover:border-slate-200",
            hasLabel && "placeholder-transparent focus:placeholder:text-slate-400",
            error && "border-red-500 focus:ring-red-500/35 focus:border-red-500 hover:border-red-500",
            leftIcon && "pl-10",
            rightIcon && "pr-10",
            className
          )}
          {...props}
        />
        {hasLabel && (
          <label
            className={cn(
              "absolute pointer-events-none text-slate-400 transition-all duration-200 origin-left text-sm select-none",
              "top-1/2 -translate-y-1/2",
              leftIcon ? "left-10" : "left-3",
              "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:left-3 peer-focus:text-xs peer-focus:text-indigo-600 peer-focus:bg-white dark:peer-focus:bg-[#1b212e] peer-focus:px-1",
              "peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:bg-white dark:peer-[:not(:placeholder-shown)]:bg-[#1b212e] peer-[:not(:placeholder-shown)]:px-1",
              error && "text-red-500 peer-focus:text-red-500",
              "peer-disabled:opacity-50"
            )}
          >
            {label}
          </label>
        )}
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 flex items-center justify-center">{rightIcon}</div>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, placeholder, error, ...props }, ref) => {
    const hasLabel = Boolean(label);
    return (
      <div className="relative w-full">
        <textarea
          ref={ref}
          suppressHydrationWarning
          placeholder={hasLabel ? " " : placeholder}
          className={cn(
            "peer w-full min-h-[80px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1b212e] p-3 text-sm text-slate-900 dark:text-white transition",
            "placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-600/35 focus:border-indigo-600",
            "hover:border-slate-300 dark:hover:border-slate-600",
            "disabled:opacity-50 disabled:bg-slate-50/50 disabled:hover:border-slate-200",
            hasLabel && "placeholder-transparent focus:placeholder:text-slate-400",
            error && "border-red-500 focus:ring-red-500/35 focus:border-red-500 hover:border-red-500",
            className
          )}
          {...props}
        />
        {hasLabel && (
          <label
            className={cn(
              "absolute pointer-events-none text-slate-400 transition-all duration-200 origin-left text-sm select-none",
              "top-3 left-3",
              "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:text-indigo-600 peer-focus:bg-white dark:peer-focus:bg-[#1b212e] peer-focus:px-1",
              "peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:bg-white dark:peer-[:not(:placeholder-shown)]:bg-[#1b212e] peer-[:not(:placeholder-shown)]:px-1",
              error && "text-red-500 peer-focus:text-red-500",
              "peer-disabled:opacity-50"
            )}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, label, error, ...props }, ref) => {
    const hasLabel = Boolean(label);
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          suppressHydrationWarning
          className={cn(
            "peer w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1b212e] px-3 text-sm text-slate-900 dark:text-white transition",
            "focus:outline-none focus:ring-1 focus:ring-indigo-600/35 focus:border-indigo-600",
            "hover:border-slate-300 dark:hover:border-slate-600",
            "disabled:opacity-50 disabled:bg-slate-50/50 disabled:hover:border-slate-200",
            error && "border-red-500 focus:ring-red-500/35 focus:border-red-500 hover:border-red-500",
            className
          )}
          {...props}
        >
          {children}
        </select>
        {hasLabel && (
          <label
            className={cn(
              "absolute pointer-events-none text-slate-400 transition-all duration-200 origin-left select-none",
              "top-0 -translate-y-1/2 left-3 text-xs bg-white dark:bg-[#1b212e] px-1",
              "peer-focus:text-indigo-600",
              error && "text-red-500 peer-focus:text-red-500",
              "peer-disabled:opacity-50"
            )}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

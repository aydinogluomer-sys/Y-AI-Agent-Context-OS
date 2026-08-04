import React, { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "command";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ 
  children, 
  variant = "primary", 
  size = "md", 
  loading = false, 
  className = "", 
  disabled, 
  ...props 
}, ref) => {
  const baseStyle = "inline-flex items-center justify-center font-sans font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-opacity-50 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variantStyles = {
    primary: "bg-optic-cyan hover:bg-opacity-80 text-void-black font-semibold shadow-[0_0_12px_rgba(0,213,255,0.2)] focus:ring-optic-cyan",
    secondary: "bg-graphite-light hover:bg-opacity-85 text-steel-muted border border-glass-border focus:ring-steel-muted",
    ghost: "bg-transparent hover:bg-white/5 text-steel-muted focus:ring-steel-muted",
    danger: "bg-corruption-red hover:bg-opacity-85 text-white font-semibold focus:ring-corruption-red",
    command: "bg-graphite-dark hover:border-optic-cyan/40 text-optic-cyan border border-glass-border font-mono tracking-wider focus:ring-optic-cyan"
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4.5 py-2.5 text-xs",
    lg: "px-6 py-3.5 text-sm"
  };

  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2.5 h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading && loadingSpinner}
      {children}
    </button>
  );
});

Button.displayName = "Button";

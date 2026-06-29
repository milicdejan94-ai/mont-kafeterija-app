import React from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-black/10 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Button({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`rounded-xl bg-mont-brown px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 ${className}`} {...props}>{children}</button>;
}

export function SecondaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50 ${className}`} {...props}>{children}</button>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-xl border border-black/15 px-3 py-2 text-sm ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full rounded-xl border border-black/15 px-3 py-2 text-sm ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-xl border border-black/15 px-3 py-2 text-sm ${props.className ?? ""}`} />;
}

export function money(value?: number | null) {
  return `${Number(value ?? 0).toFixed(2)} KM`;
}

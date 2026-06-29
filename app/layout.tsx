import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mont Kafeterija Lager",
  description: "Interna aplikacija za lager, potrošnju i finansijske izvještaje Mont kafeterije",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bs">
      <body>{children}</body>
    </html>
  );
}

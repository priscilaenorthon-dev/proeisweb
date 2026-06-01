import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PROEIS Bot',
  description: 'Automação de login e inscrição em serviços PROEIS',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}

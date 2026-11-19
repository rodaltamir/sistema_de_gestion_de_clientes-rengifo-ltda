import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sistemas de gestión de clientes Rengifo Ltda',
  description:
    'Sistemas de gestión de clientes Rengifo Ltda: centralización, búsqueda rápida, cálculo fiscal y exportación.',
  icons: {
    icon: '/assets/logo-rengifo.png'
  },
  other: {
    'rengifo-siat-app': '1'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

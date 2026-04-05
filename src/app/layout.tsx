import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Media Picker — PR подборка медиа',
  description: 'Система подборки медиа для PR-агентства на базе AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}

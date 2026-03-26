import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ScreenAccessTracker } from '@/components/ScreenAccessTracker'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Access Portal',
  description: 'UniFi Access management portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <ScreenAccessTracker />
          {children}
        </Providers>
      </body>
    </html>
  )
}

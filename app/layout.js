import './globals.css';
import { Chakra_Petch, JetBrains_Mono, Inter } from 'next/font/google';
import Header from './components/Header';

// Same typography as the OPS in One Word game: Chakra Petch (display), JetBrains Mono (numbers), Inter (body).
const display = Chakra_Petch({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-display' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500','700'], variable: '--font-mono' });
const body = Inter({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-body' });

export const metadata = {
  title: 'OPSPHERE · Supply Chain Simulation',
  description: 'OPSPHERE — Operations Club, IBS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>
        <Header />
        {children}
        <footer
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            textAlign: 'center',
            padding: '12px',
            fontSize: '13px',
            letterSpacing: '0.02em',
            color: 'var(--text-muted)',
          }}
        >
          Built by Brahmajit Saha
        </footer>
      </body>
    </html>
  );
}

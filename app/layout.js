import './globals.css';
import Header from './components/Header';

export const metadata = {
  title: 'OPSPHERE · Supply Chain Simulation',
  description: 'OPSPHERE — Operations Club, IBS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
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

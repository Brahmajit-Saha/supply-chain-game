export const metadata = {
  title: 'Supply Chain Simulation',
  description: 'Operations Club MBA event',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#0d1117',
          color: '#e6edf3',
        }}
      >
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
            color: '#6e7781',
          }}
        >
          Built by Brahmajit Saha
        </footer>
      </body>
    </html>
  );
}

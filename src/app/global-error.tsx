'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
          <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '1rem' }}>
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                background: 'linear-gradient(135deg, oklch(0.65 0.2 350), oklch(0.55 0.2 303))',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

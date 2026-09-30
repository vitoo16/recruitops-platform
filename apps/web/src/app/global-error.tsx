'use client';

import { useEffect } from 'react';
import { captureBrowserException } from '../lib/monitoring/browser-error-monitoring';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureBrowserException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
            <h1 style={{ marginBottom: '0.75rem' }}>
              Something went wrong
              <br />
              <span lang="vi">Đã xảy ra lỗi</span>
            </h1>
            <p style={{ marginBottom: '1.25rem' }}>
              RecruitOps could not continue this screen. Please try again.
              <br />
              <span lang="vi">RecruitOps không thể tiếp tục màn hình này. Vui lòng thử lại.</span>
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: '44px',
                padding: '0.625rem 1rem',
                border: '1px solid currentColor',
                borderRadius: '0.5rem',
                background: 'transparent',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Try again / <span lang="vi">Thử lại</span>
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

import React from 'react';

export default function ToastNotification({ toast, isMobile }) {
  if (!toast) return null;

  return (
    <div
      className={`toast-notification ${toast.type}`}
      style={{
        position: 'fixed',
        top: isMobile ? 'calc(env(safe-area-inset-top, 12px) + 14px)' : '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 18px',
        borderRadius: '999px',
        background: 'var(--bg-card)',
        color: 'var(--text-main)',
        border: `1px solid ${toast.type === 'error' ? 'var(--color-danger)' : toast.type === 'info' ? 'var(--color-info)' : 'var(--color-success)'}`,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        fontSize: '13.5px',
        fontWeight: '600',
        maxWidth: '90vw',
        width: 'max-content',
        pointerEvents: 'auto'
      }}
    >
      <span
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: toast.type === 'error' ? 'var(--bg-danger)' : toast.type === 'info' ? 'var(--bg-info)' : 'var(--bg-success)',
          color: toast.type === 'error' ? 'var(--color-danger)' : toast.type === 'info' ? 'var(--color-info)' : 'var(--color-success)'
        }}
      >
        {toast.type === 'error' ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : toast.type === 'info' ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        )}
      </span>
      <span style={{ lineHeight: '1.35' }}>{toast.message}</span>
    </div>
  );
}

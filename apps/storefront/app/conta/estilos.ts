import type { CSSProperties } from 'react';

/** Estilos das telas de conta, sobre as variáveis do tema do tenant (US-077). */
export const pagina: CSSProperties = {
  padding: 'calc(var(--mkt-space, 0.75rem) * 3)',
  maxWidth: '28rem',
  margin: '0 auto',
};

export const campo: CSSProperties = { display: 'grid', gap: '.25rem', marginBottom: '1rem' };

export const entrada: CSSProperties = {
  padding: '.6rem .75rem',
  border: '1px solid var(--mkt-color-muted, #656d76)',
  borderRadius: 'var(--mkt-radius, 8px)',
  font: 'inherit',
};

export const botao: CSSProperties = {
  padding: '.7rem 1.25rem',
  border: 0,
  borderRadius: 'var(--mkt-radius, 8px)',
  background: 'var(--mkt-color-primary, #1f6feb)',
  color: 'var(--mkt-color-on-primary, #fff)',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

export const erro: CSSProperties = { color: 'var(--mkt-color-danger, #cf222e)', fontSize: '.9rem' };

export const sucesso: CSSProperties = {
  padding: '1rem',
  borderRadius: 'var(--mkt-radius, 8px)',
  background: 'var(--mkt-color-surface, #f6f8fa)',
};

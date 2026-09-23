import type { CSSProperties } from 'react';

/** Estilos mínimos do console (a UI real vem com `packages/ui`). */
export const pagina: CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  padding: '2rem',
  maxWidth: '72rem',
  margin: '0 auto',
  lineHeight: 1.5,
};

export const celula: CSSProperties = { padding: '.5rem', borderBottom: '1px solid #eee', textAlign: 'left' };

export const campo: CSSProperties = { display: 'grid', gap: '.25rem', marginBottom: '.75rem' };

export const botao: CSSProperties = {
  padding: '.5rem 1rem',
  border: '1px solid #ccc',
  borderRadius: '.375rem',
  background: '#fff',
  cursor: 'pointer',
};

export const alerta: CSSProperties = {
  padding: '.75rem',
  border: '1px solid #f0c0c0',
  background: '#fff5f5',
  borderRadius: '.375rem',
};

export const moeda = (cents: number): string =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

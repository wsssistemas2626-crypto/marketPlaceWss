import { revalidatePath } from 'next/cache';
import Link from 'next/link';

import { panelFetch } from '../../lib/api';
import { alerta, botao, campo, pagina } from '../../lib/ui';

interface Theme {
  colors: Record<string, string>;
  typography: { fontFamily: string; headingWeight: number };
  shape: { radiusPx: number; density: string };
  brand: { storeName?: string; logoUrl?: string };
}

interface ThemeResponse {
  theme: Theme;
  cssVariables: Record<string, string>;
}

const CORES = ['primary', 'onPrimary', 'background', 'surface', 'text', 'muted', 'danger', 'success'];
const FONTES = ['system', 'inter', 'roboto', 'lora', 'poppins'];

/**
 * Personalização da loja (US-077 / RF-TEN-04).
 *
 * O que se edita aqui é o **rascunho**: a loja só muda quando o rascunho é
 * publicado. O quadro da direita é o preview, montado com as mesmas variáveis
 * CSS que o storefront injeta — nada de CSS livre, só os tokens do schema.
 */
export default async function TemaPage() {
  const { data, error } = await panelFetch<ThemeResponse>('/v1/admin/theme');

  async function salvar(formulario: FormData): Promise<void> {
    'use server';

    const numero = (nome: string, padrao: number): number => {
      const valor = Number(formulario.get(nome));
      return Number.isFinite(valor) && valor !== 0 ? valor : padrao;
    };

    const corpo = {
      colors: Object.fromEntries(CORES.map((cor) => [cor, String(formulario.get(cor) ?? '')])),
      typography: {
        fontFamily: String(formulario.get('fontFamily') ?? 'system'),
        headingWeight: numero('headingWeight', 700),
      },
      shape: {
        radiusPx: Math.trunc(numero('radiusPx', 8)),
        density: String(formulario.get('density') ?? 'comfortable'),
      },
      brand: {
        ...(String(formulario.get('storeName') ?? '') === ''
          ? {}
          : { storeName: String(formulario.get('storeName')) }),
      },
    };

    await panelFetch('/v1/admin/theme', { method: 'PUT', body: JSON.stringify(corpo) });
    revalidatePath('/tema');
  }

  async function publicar(): Promise<void> {
    'use server';
    await panelFetch('/v1/admin/theme/publish', { method: 'POST' });
    revalidatePath('/tema');
  }

  async function descartar(): Promise<void> {
    'use server';
    await panelFetch('/v1/admin/theme/discard', { method: 'POST' });
    revalidatePath('/tema');
  }

  if (data === undefined) {
    return (
      <main style={pagina}>
        <h1>Tema da loja</h1>
        <p style={alerta} role="alert">
          {error}
        </p>
        <Link href="/">Voltar</Link>
      </main>
    );
  }

  const { theme, cssVariables } = data;

  return (
    <main style={pagina}>
      <p>
        <Link href="/">← Admin</Link>
      </p>
      <h1>Tema da loja</h1>
      <p>
        Edite o rascunho e veja o preview. A loja só muda quando você <strong>publicar</strong>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>
        <form action={salvar}>
          <h2 style={{ fontSize: '1rem' }}>Cores</h2>
          {CORES.map((cor) => (
            <label key={cor} style={campo}>
              {cor}
              <input type="color" name={cor} defaultValue={theme.colors[cor]} />
            </label>
          ))}

          <h2 style={{ fontSize: '1rem' }}>Tipografia e forma</h2>
          <label style={campo}>
            Família
            <select name="fontFamily" defaultValue={theme.typography.fontFamily}>
              {FONTES.map((fonte) => (
                <option key={fonte} value={fonte}>
                  {fonte}
                </option>
              ))}
            </select>
          </label>
          <label style={campo}>
            Peso dos títulos
            <input
              type="number"
              name="headingWeight"
              min={400}
              max={900}
              step={100}
              defaultValue={theme.typography.headingWeight}
            />
          </label>
          <label style={campo}>
            Raio das bordas (px)
            <input type="number" name="radiusPx" min={0} max={32} defaultValue={theme.shape.radiusPx} />
          </label>
          <label style={campo}>
            Densidade
            <select name="density" defaultValue={theme.shape.density}>
              <option value="comfortable">comfortable</option>
              <option value="compact">compact</option>
            </select>
          </label>
          <label style={campo}>
            Nome da loja
            <input type="text" name="storeName" maxLength={60} defaultValue={theme.brand.storeName ?? ''} />
          </label>

          <button type="submit" style={botao}>
            Salvar rascunho
          </button>
        </form>

        <section>
          <h2 style={{ fontSize: '1rem' }}>Preview</h2>
          <div
            style={{
              ...(cssVariables as Record<string, string>),
              background: 'var(--mkt-color-background)',
              color: 'var(--mkt-color-text)',
              border: '1px solid #ddd',
              borderRadius: 'var(--mkt-radius)',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 'var(--mkt-heading-weight)' }}>
              {theme.brand.storeName ?? 'Sua loja'}
            </h3>
            <p style={{ color: 'var(--mkt-color-muted)' }}>Assim a loja vai aparecer para o comprador.</p>
            <div
              style={{
                background: 'var(--mkt-color-surface)',
                borderRadius: 'var(--mkt-radius)',
                padding: '1rem',
                marginBottom: '1rem',
              }}
            >
              Produto em destaque
            </div>
            <span
              style={{
                display: 'inline-block',
                background: 'var(--mkt-color-primary)',
                color: 'var(--mkt-color-on-primary)',
                borderRadius: 'var(--mkt-radius)',
                padding: '.5rem 1rem',
              }}
            >
              Comprar
            </span>
          </div>

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
            <form action={publicar}>
              <button type="submit" style={botao}>
                Publicar na loja
              </button>
            </form>
            <form action={descartar}>
              <button type="submit" style={botao}>
                Descartar rascunho
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';

/** Apps e pacotes que rodam em Node (api, worker, módulos, adapters). */
export const nodeConfig = tseslint.config(...baseConfig, {
  languageOptions: {
    globals: { ...globals.node },
  },
  rules: {
    // composition root e bootstrap leem process.env legitimamente
    'no-restricted-globals': 'off',
    // `import type` apaga o valor em runtime e quebra o `design:paramtypes`
    // que a injeção de dependência do Nest lê (emitDecoratorMetadata).
    '@typescript-eslint/consistent-type-imports': 'off',
  },
});

export default nodeConfig;

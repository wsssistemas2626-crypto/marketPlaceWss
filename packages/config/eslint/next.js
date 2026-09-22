import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';

/** Apps Next.js (storefront, admin, seller-center, console). */
export const nextConfig = tseslint.config(
  ...baseConfig,
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  { ignores: ['**/next-env.d.ts'] },
);

export default nextConfig;

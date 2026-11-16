import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'public'] },
  ...tseslint.configs.recommended,
  // Analyse statique de sécurité (SAST) : eval, RegExp dynamiques, chemins non littéraux, etc.
  security.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Les index sont bornés par construction (tableaux de 361 points, instances) ;
      // `noUncheckedIndexedAccess` impose déjà de traiter l'absence à la compilation.
      '@typescript-eslint/no-non-null-assertion': 'off',
      'security/detect-object-injection': 'off',
      // Faux positifs : la règle vise les comparaisons de secrets, l'application n'en manipule aucun.
      'security/detect-possible-timing-attacks': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // Scripts d'outillage : lisent et écrivent des chemins construits à partir du dépôt lui-même.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
);

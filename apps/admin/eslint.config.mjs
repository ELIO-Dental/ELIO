// F.4 Final QA (2026-08-29): the original FlatCompat-bridged config
// (`compat.extends("next/core-web-vitals", "next/typescript")`) has been
// broken since this repo's initial commit — `npx eslint .` threw
// "TypeError: Converting circular structure to JSON" on eslint-plugin-
// react's own configs.flat.recommended object, a known incompatibility
// between FlatCompat's JSON-based config validation and this exact
// eslint-plugin-react/ESLint 9 combination. Fixed identically across every
// app in this monorepo — see apps/shell/eslint.config.mjs's identical
// comment for the full story. eslint-config-next ships its OWN native flat-
// config array as of this version (peerDependency eslint >=9.0.0) —
// importing it directly skips FlatCompat's broken JSON round-trip entirely.
import nextConfig from "eslint-config-next";

const eslintConfig = [...nextConfig];

export default eslintConfig;

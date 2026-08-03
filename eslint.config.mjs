import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: directory });

const eslintConfig = [{ ignores: [".next/**", "drizzle/**", "next-env.d.ts"] }, ...compat.extends("next/core-web-vitals", "next/typescript")];

export default eslintConfig;

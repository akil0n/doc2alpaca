import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Next 16 新启用的 React Compiler 规则，对既有代码产生大量非安全类告警，
      // 关闭以保持与升级前一致的 lint 行为（升级前这些规则不存在）。
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "release_build/**",
    "node_modules/**",
  ]),
]);
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "src-tauri/target/**",
    "next-env.d.ts",
    // Capacitor 生成的原生工程：由 Android Studio / Gradle 维护，不是产品界面代码
    "android/**",
    // 静态站导出的设计样张：独立原型，不参与产品构建
    "static-site-export-design-sample(beta)/**",
    // 设计参考 demo 与 IDE 本地状态（已在 .gitignore 里）
    "sample/**",
    ".vs/**",
  ]),
  {
    rules: {
      // 约定：前缀下划线的形参 / 变量表示「占位不用」，不该报未使用
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // eslint-config-next 16 起内置 React Compiler 的规则，默认是 error。
    // 这两类在库里是**有意为之**的写法，改成 warn：问题照样全部打印，但不再阻断
    // `npm run lint`，贡献者不会分不清哪些红叉是自己这次改出来的。
    //
    // 想收这批债时把它们改回 error，再按 React 文档逐处改：
    //   refs               —— 渲染期同步 ref（「latest ref」）改成 useEffect 里同步
    //   set-state-in-effect —— effect 里同步 setState 改成在事件回调里派生，
    //                          或把派生值直接算在 render 里（不要存 state）
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;

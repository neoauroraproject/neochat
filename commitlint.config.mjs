export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "api",
        "web",
        "admin",
        "shared",
        "config",
        "crypto",
        "i18n",
        "ui",
        "providers",
        "plugins",
        "sdk",
        "deploy",
        "docs",
        "deps",
        "ci",
        "root",
      ],
    ],
  },
};

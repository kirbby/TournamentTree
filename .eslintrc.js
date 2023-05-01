module.exports = {
    root: true,
    env: {
        node: true,
    },
    plugins: [
        "es-beautifier",
        "prettier",
        "tailwindcss",
        "import",
    ],
    extends: [
        "plugin:vue/vue3-recommended",
        "plugin:es-beautifier/standard",
        "@vue/typescript/recommended",
        "plugin:tailwindcss/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
    ],
    parserOptions: {
        ecmaVersion: 2022,
        parser: "@typescript-eslint/parser",
    },
    ignorePatterns: [
        "**/supabase*.ts",
        "components.d.ts",
        "**/dist/**",
        "**/supabase/**",
    ],
    rules: {
        "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
        "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
        "comma-dangle": ["error", "only-multiline"],
        "linebreak-style": "off",
        "indent": ["error", 4],
        "vue/script-indent": ["off", 4, { "baseIndent": 0 }],
        "vue/html-indent": ["error", 4, { "baseIndent": 0 }],
        "semi": [2, "always"],
        "quotes": [
            2,
            "double",
            {
                avoidEscape: true,
                allowTemplateLiterals: true,
            },
        ],
        "tailwindcss/no-custom-classname": 0,
        "import/order": [
            "error",
            {
                "groups": [
                    "builtin",
                    "external",
                    "internal",
                    "parent",
                    "sibling",
                    "index"
                ],
                "newlines-between": "never",
            },
        ],
        "padding-line-between-statements": [
            "error",
            { blankLine: "always", prev: "*", next: "return" },
            { blankLine: "always", prev: "function", next: "*" },
            { blankLine: "always", prev: "*", next: "function" },
            { blankLine: "always", prev: "if", next: "*" },
            { blankLine: "always", prev: "*", next: "if" },
        ],
    },
    overrides: [
        {
            // vue plugin
            files: ["*.vue"],
            parser: "vue-eslint-parser",
        },
        {
            // import plugin to work with .vue files
            files: ["*.vue"],
            rules: {
                "import/order": [
                    "error",
                    {
                        "groups": [
                            "builtin",
                            "external",
                            "internal",
                            "parent",
                            "sibling",
                            "index"
                        ]
                    }],
                "import/newline-after-import": "error"
            }
        }
    ],
    settings: {
        "import/resolver": {
            "node": true,
            "typescript": true,
        },
    },
};

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import Components from "unplugin-vue-components/vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue({
            script: {
                propsDestructure: true
            }
        }),
        Components({
            resolvers: [
                IconsResolver(),
            ],
        }),
        Icons({ compiler: "vue3", autoInstall: true })
    ],
    define: {
        APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    resolve: {
        alias: [
            {
                find: "@",
                replacement: "/src"
            }
        ]
    },
    base: "/",
    server: {
        host: "127.0.0.1",
        port: 3005,
    },
});

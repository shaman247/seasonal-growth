import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    publicDir: "public",
    base: "/rc/dist/",
    build: {
        assetsInlineLimit: 0,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                game: resolve(__dirname, "game.html"),
            },
        },
    },
});

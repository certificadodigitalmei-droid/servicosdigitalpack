import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode ?? "development", process.cwd(), "");
  Object.assign(process.env, serverEnv);

  return {
    tanstackStart: {
      server: { entry: "server" },
    },
    vite: {
      resolve: {
        alias: {
          "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
          "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
          entities: path.resolve(__dirname, "node_modules/entities"),
        },
      },
    },
  };
});

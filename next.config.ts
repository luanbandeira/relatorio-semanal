import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // O cache em disco do build registrava valores de variáveis de ambiente
    // (inclusive a chave secreta). Desligado para que segredos não fiquem
    // gravados em artefatos de build.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;

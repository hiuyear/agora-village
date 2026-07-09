import { withWorkflow } from "workflow/next";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root: a stray package-lock.json in the home dir was
  // making Next infer ~ as the root, breaking WDK's injected route paths.
  outputFileTracingRoot: __dirname,
};

export default withWorkflow(nextConfig);

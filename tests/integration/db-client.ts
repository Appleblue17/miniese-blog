/**
 * @file Bridge to import prisma client for integration tests.
 * Uses direct relative path to avoid @/ alias resolution issues in dynamic imports.
 */
export { prisma } from "../../src/lib/db";

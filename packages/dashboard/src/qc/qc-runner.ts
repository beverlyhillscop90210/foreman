import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface QCCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface QCResult {
  passed: boolean;
  checks: QCCheck[];
  summary: string;
  timestamp: string;
}

/**
 * Run all QC checks on the project
 */
export async function runQC(projectDir: string, branchName: string): Promise<QCResult> {
  const checks: QCCheck[] = [];
  const timestamp = new Date().toISOString();

  // Run all checks
  checks.push(await buildCheck(projectDir));
  checks.push(await importCheck(projectDir));
  checks.push(await storeCheck(projectDir));
  checks.push(await routeCheck(projectDir));
  checks.push(await manifestCheck(projectDir));

  // Determine overall pass/fail
  const passed = checks.every(check => check.passed);
  const failedCount = checks.filter(check => !check.passed).length;
  
  const summary = passed 
    ? `✓ All ${checks.length} QC checks passed on branch ${branchName}`
    : `✗ ${failedCount} of ${checks.length} QC checks failed on branch ${branchName}`;

  return {
    passed,
    checks,
    summary,
    timestamp
  };
}

/**
 * Check 1: Build Check - Run vite build
 */
async function buildCheck(projectDir: string): Promise<QCCheck> {
  try {
    execSync('npx vite build', {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    return {
      name: 'build_check',
      passed: true,
      message: 'Build completed successfully'
    };
  } catch (error: any) {
    return {
      name: 'build_check',
      passed: false,
      message: `Build failed: ${error.message}`
    };
  }
}

/**
 * Check 2: Import Check - Verify all local imports exist
 */
async function importCheck(projectDir: string): Promise<QCCheck> {
  try {
    const srcDir = join(projectDir, 'src');
    const files = getAllTsFiles(srcDir);

    const missingImports: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const importRegex = /from\s+['"]([.@][^'"]+)['"]/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Skip non-local imports
        if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
          continue;
        }

        // Resolve the import path
        let resolvedPath = importPath;
        if (importPath.startsWith('@/')) {
          resolvedPath = importPath.replace('@/', '');
        } else {
          const fileDir = file.substring(0, file.lastIndexOf('/'));
          resolvedPath = join(fileDir, importPath).replace(srcDir + '/', '');
        }

        // Check if file exists (try with and without extensions)
        const possiblePaths = [
          join(srcDir, resolvedPath),
          join(srcDir, resolvedPath + '.ts'),
          join(srcDir, resolvedPath + '.tsx'),
          join(srcDir, resolvedPath, 'index.ts'),
          join(srcDir, resolvedPath, 'index.tsx')
        ];

        const exists = possiblePaths.some(p => existsSync(p));
        if (!exists) {
          missingImports.push(`${file.replace(projectDir + '/', '')}: ${importPath}`);
        }
      }
    }

    if (missingImports.length > 0) {
      return {
        name: 'import_check',
        passed: false,
        message: `Missing imports found:\n${missingImports.join('\n')}`
      };
    }

    return {
      name: 'import_check',
      passed: true,
      message: `All imports verified across ${files.length} files`
    };
  } catch (error: any) {
    return {
      name: 'import_check',
      passed: false,
      message: `Import check failed: ${error.message}`
    };
  }
}

/**
 * Check 3: Store Check - Verify all useXxxStore references have corresponding files
 */
async function storeCheck(projectDir: string): Promise<QCCheck> {
  try {
    const pagesDir = join(projectDir, 'src', 'pages');
    const storesDir = join(projectDir, 'src', 'stores');

    if (!existsSync(pagesDir)) {
      return {
        name: 'store_check',
        passed: false,
        message: 'Pages directory not found'
      };
    }

    const pageFiles = getAllTsFiles(pagesDir);
    const storeReferences = new Set<string>();

    // Find all useXxxStore references
    for (const file of pageFiles) {
      const content = readFileSync(file, 'utf-8');
      const storeRegex = /use([A-Z][a-zA-Z]*)Store/g;
      let match;

      while ((match = storeRegex.exec(content)) !== null) {
        const storeName = match[1].charAt(0).toLowerCase() + match[1].slice(1);
        storeReferences.add(storeName);
      }
    }

    // Check if each store file exists
    const missingStores: string[] = [];
    for (const storeName of storeReferences) {
      const storeFile = join(storesDir, `${storeName}Store.ts`);
      if (!existsSync(storeFile)) {
        missingStores.push(`${storeName}Store.ts`);
      }
    }

    if (missingStores.length > 0) {
      return {
        name: 'store_check',
        passed: false,
        message: `Missing store files: ${missingStores.join(', ')}`
      };
    }

    return {
      name: 'store_check',
      passed: true,
      message: `All ${storeReferences.size} store references verified`
    };
  } catch (error: any) {
    return {
      name: 'store_check',
      passed: false,
      message: `Store check failed: ${error.message}`
    };
  }
}

/**
 * Check 4: Route Check - Verify all routes have nav links
 */
async function routeCheck(projectDir: string): Promise<QCCheck> {
  try {
    const appFile = join(projectDir, 'src', 'App.tsx');
    const topBarFile = join(projectDir, 'src', 'components', 'layout', 'TopBar.tsx');

    if (!existsSync(appFile) || !existsSync(topBarFile)) {
      return {
        name: 'route_check',
        passed: false,
        message: 'App.tsx or TopBar.tsx not found'
      };
    }

    const appContent = readFileSync(appFile, 'utf-8');
    const topBarContent = readFileSync(topBarFile, 'utf-8');

    // Extract routes from App.tsx
    const routeRegex = /<Route\s+path=["']([^"']+)["']/g;
    const routes = new Set<string>();
    let match;

    while ((match = routeRegex.exec(appContent)) !== null) {
      const path = match[1];
      // Skip wildcard routes
      if (path !== '*') {
        routes.add(path);
      }
    }

    // Extract nav links from TopBar.tsx
    const navLinkRegex = /path:\s*['"]([^'"]+)['"]/g;
    const navLinks = new Set<string>();

    while ((match = navLinkRegex.exec(topBarContent)) !== null) {
      navLinks.add(match[1]);
    }

    // Check if all routes have nav links
    const missingNavLinks: string[] = [];
    for (const route of routes) {
      if (!navLinks.has(route)) {
        missingNavLinks.push(route);
      }
    }

    if (missingNavLinks.length > 0) {
      return {
        name: 'route_check',
        passed: false,
        message: `Routes missing nav links: ${missingNavLinks.join(', ')}`
      };
    }

    return {
      name: 'route_check',
      passed: true,
      message: `All ${routes.size} routes have corresponding nav links`
    };
  } catch (error: any) {
    return {
      name: 'route_check',
      passed: false,
      message: `Route check failed: ${error.message}`
    };
  }
}

/**
 * Check 5: Manifest Check - Verify all files listed in MANIFEST.md exist
 */
async function manifestCheck(projectDir: string): Promise<QCCheck> {
  try {
    const manifestFile = join(projectDir, 'MANIFEST.md');

    if (!existsSync(manifestFile)) {
      return {
        name: 'manifest_check',
        passed: true,
        message: 'No MANIFEST.md found (optional check)'
      };
    }

    const content = readFileSync(manifestFile, 'utf-8');
    const fileRegex = /src\/[a-zA-Z0-9/_.-]+\.tsx?/g;
    const files = new Set<string>();
    let match;

    while ((match = fileRegex.exec(content)) !== null) {
      files.add(match[0]);
    }

    const missingFiles: string[] = [];
    for (const file of files) {
      const fullPath = join(projectDir, file);
      if (!existsSync(fullPath)) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      return {
        name: 'manifest_check',
        passed: false,
        message: `Files listed in MANIFEST.md are missing:\n${missingFiles.join('\n')}`
      };
    }

    return {
      name: 'manifest_check',
      passed: true,
      message: `All ${files.size} files listed in MANIFEST.md exist`
    };
  } catch (error: any) {
    return {
      name: 'manifest_check',
      passed: false,
      message: `Manifest check failed: ${error.message}`
    };
  }
}

/**
 * Helper: Recursively get all .ts and .tsx files
 */
function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    if (!existsSync(currentDir)) return;

    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}


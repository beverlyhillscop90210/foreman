/**
 * QC Agent - Automated Quality Control
 * Run after every task to verify project integrity
 */

import { parseManifest, type ProjectManifest } from './manifest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface QCResult {
  passed: boolean;
  checks: QCCheck[];
  summary: string;
  timestamp: string;
}

export interface QCCheck {
  name: string;
  passed: boolean;
  details: string;
  critical?: boolean;
}

/**
 * Run all QC checks on the project
 */
export async function runQC(projectDir: string): Promise<QCResult> {
  const checks: QCCheck[] = [];
  const timestamp = new Date().toISOString();

  console.log('🔍 QC Agent: Starting quality control checks...\n');

  // Load and parse manifest
  const manifestPath = path.join(projectDir, 'MANIFEST.md');
  let manifest: ProjectManifest;
  
  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    manifest = parseManifest(manifestContent);
    checks.push({
      name: 'Manifest Parse',
      passed: true,
      details: 'Successfully parsed MANIFEST.md',
    });
  } catch (error) {
    checks.push({
      name: 'Manifest Parse',
      passed: false,
      details: `Failed to parse MANIFEST.md: ${error}`,
      critical: true,
    });
    return generateResult(checks, timestamp);
  }

  // 1. BUILD CHECK: Run `npx vite build` - must exit 0
  checks.push(await checkBuild(projectDir));

  // 2. ROUTE CHECK: Parse App.tsx, verify all routes from MANIFEST exist
  checks.push(await checkRoutes(projectDir, manifest));

  // 3. NAV CHECK: Parse TopBar.tsx, verify all nav links from MANIFEST exist
  checks.push(await checkNavLinks(projectDir, manifest));

  // 4. STORE CHECK: For each store in manifest, verify the store file exists
  checks.push(await checkStores(projectDir, manifest));

  // 5. PAGE CHECK: Verify all pages exist
  checks.push(await checkPages(projectDir, manifest));

  // 6. COMPONENT CHECK: Verify all components exist
  checks.push(await checkComponents(projectDir, manifest));

  // 7. IMPORT CHECK: For each import in src/**, verify the imported file exists
  // TODO: Implement comprehensive import validation
  checks.push({
    name: 'Import Validation',
    passed: true,
    details: 'TODO: Implement comprehensive import checking',
  });

  return generateResult(checks, timestamp);
}

/**
 * Check 1: Build succeeds
 */
async function checkBuild(projectDir: string): Promise<QCCheck> {
  try {
    console.log('  ⚙️  Running build...');
    execSync('npx vite build', {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return {
      name: 'Build Check',
      passed: true,
      details: 'Build completed successfully',
      critical: true,
    };
  } catch (error: any) {
    return {
      name: 'Build Check',
      passed: false,
      details: `Build failed: ${error.message}`,
      critical: true,
    };
  }
}

/**
 * Check 2: Routes match manifest
 */
async function checkRoutes(projectDir: string, manifest: ProjectManifest): Promise<QCCheck> {
  // TODO: Parse App.tsx and verify routes
  const appPath = path.join(projectDir, 'src', 'App.tsx');

  try {
    const appContent = fs.readFileSync(appPath, 'utf-8');
    const missingRoutes: string[] = [];

    for (const route of manifest.routes) {
      // Skip catch-all routes
      if (route.path === '*') continue;

      // Check if route path and component exist in App.tsx
      const hasPath = appContent.includes(`path="${route.path}"`);
      const hasComponent = appContent.includes(route.component);

      if (!hasPath || !hasComponent) {
        missingRoutes.push(`${route.path} → ${route.component}`);
      }
    }

    if (missingRoutes.length > 0) {
      return {
        name: 'Route Check',
        passed: false,
        details: `Missing routes: ${missingRoutes.join(', ')}`,
        critical: true,
      };
    }

    return {
      name: 'Route Check',
      passed: true,
      details: `All ${manifest.routes.length} routes verified`,
    };
  } catch (error: any) {
    return {
      name: 'Route Check',
      passed: false,
      details: `Failed to check routes: ${error.message}`,
      critical: true,
    };
  }
}

/**
 * Check 3: Navigation links match manifest
 */
async function checkNavLinks(projectDir: string, manifest: ProjectManifest): Promise<QCCheck> {
  const topBarPath = path.join(projectDir, 'src', 'components', 'layout', 'TopBar.tsx');

  try {
    const topBarContent = fs.readFileSync(topBarPath, 'utf-8');
    const missingLinks: string[] = [];

    for (const link of manifest.navLinks) {
      // Check if nav link exists in TopBar
      const hasLabel = topBarContent.includes(link.label);
      const hasPath = topBarContent.includes(link.path);

      if (!hasLabel || !hasPath) {
        missingLinks.push(`${link.label} → ${link.path}`);
      }
    }

    if (missingLinks.length > 0) {
      return {
        name: 'Navigation Check',
        passed: false,
        details: `Missing nav links: ${missingLinks.join(', ')}`,
        critical: true,
      };
    }

    return {
      name: 'Navigation Check',
      passed: true,
      details: `All ${manifest.navLinks.length} nav links verified`,
    };
  } catch (error: any) {
    return {
      name: 'Navigation Check',
      passed: false,
      details: `Failed to check nav links: ${error.message}`,
      critical: true,
    };
  }
}

/**
 * Check 4: Stores exist and export correctly
 */
async function checkStores(projectDir: string, manifest: ProjectManifest): Promise<QCCheck> {
  const missingStores: string[] = [];
  const missingExports: string[] = [];

  for (const store of manifest.stores) {
    const storePath = path.join(projectDir, store.file);

    if (!fs.existsSync(storePath)) {
      missingStores.push(store.file);
      continue;
    }

    try {
      const storeContent = fs.readFileSync(storePath, 'utf-8');

      for (const exportName of store.exports) {
        if (!storeContent.includes(`export`) || !storeContent.includes(exportName)) {
          missingExports.push(`${exportName} from ${store.file}`);
        }
      }
    } catch (error) {
      missingStores.push(store.file);
    }
  }

  if (missingStores.length > 0 || missingExports.length > 0) {
    const details = [
      missingStores.length > 0 ? `Missing stores: ${missingStores.join(', ')}` : '',
      missingExports.length > 0 ? `Missing exports: ${missingExports.join(', ')}` : '',
    ].filter(Boolean).join('; ');

    return {
      name: 'Store Check',
      passed: false,
      details,
      critical: true,
    };
  }

  return {
    name: 'Store Check',
    passed: true,
    details: `All ${manifest.stores.length} stores verified`,
  };
}

/**
 * Check 5: Pages exist
 */
async function checkPages(projectDir: string, manifest: ProjectManifest): Promise<QCCheck> {
  const missingPages: string[] = [];

  for (const page of manifest.pages) {
    const pagePath = path.join(projectDir, page.file);

    if (!fs.existsSync(pagePath)) {
      missingPages.push(page.file);
    }
  }

  if (missingPages.length > 0) {
    return {
      name: 'Page Check',
      passed: false,
      details: `Missing pages: ${missingPages.join(', ')}`,
      critical: true,
    };
  }

  return {
    name: 'Page Check',
    passed: true,
    details: `All ${manifest.pages.length} pages verified`,
  };
}

/**
 * Check 6: Components exist
 */
async function checkComponents(projectDir: string, manifest: ProjectManifest): Promise<QCCheck> {
  const missingComponents: string[] = [];

  for (const component of manifest.components) {
    const componentPath = path.join(projectDir, component.file);

    if (!fs.existsSync(componentPath)) {
      missingComponents.push(component.file);
    }
  }

  if (missingComponents.length > 0) {
    return {
      name: 'Component Check',
      passed: false,
      details: `Missing components: ${missingComponents.join(', ')}`,
      critical: true,
    };
  }

  return {
    name: 'Component Check',
    passed: true,
    details: `All ${manifest.components.length} components verified`,
  };
}

/**
 * Generate final QC result
 */
function generateResult(checks: QCCheck[], timestamp: string): QCResult {
  const failedChecks = checks.filter(c => !c.passed);
  const criticalFailures = failedChecks.filter(c => c.critical);
  const passed = failedChecks.length === 0;

  let summary = '';
  if (passed) {
    summary = `✅ All ${checks.length} checks passed`;
  } else {
    summary = `❌ ${failedChecks.length}/${checks.length} checks failed`;
    if (criticalFailures.length > 0) {
      summary += ` (${criticalFailures.length} critical)`;
    }
  }

  // Print results
  console.log('\n📊 QC Results:');
  console.log('─'.repeat(60));
  for (const check of checks) {
    const icon = check.passed ? '✅' : (check.critical ? '❌' : '⚠️');
    console.log(`${icon} ${check.name}: ${check.details}`);
  }
  console.log('─'.repeat(60));
  console.log(summary);
  console.log('');

  return {
    passed,
    checks,
    summary,
    timestamp,
  };
}


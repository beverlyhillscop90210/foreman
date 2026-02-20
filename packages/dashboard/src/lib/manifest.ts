/**
 * Manifest Parser
 * Parses MANIFEST.md into structured data for QC validation
 */

export interface ProjectManifest {
  routes: { path: string; component: string; file?: string }[];
  navLinks: { label: string; path: string }[];
  stores: { file: string; exports: string[] }[];
  pages: { name: string; file: string; dependencies?: string[] }[];
  components: { name: string; file: string }[];
  types: { name: string; file: string; description?: string }[];
}

/**
 * Parse MANIFEST.md content into structured data
 */
export function parseManifest(content: string): ProjectManifest {
  const manifest: ProjectManifest = {
    routes: [],
    navLinks: [],
    stores: [],
    pages: [],
    components: [],
    types: [],
  };

  const lines = content.split('\n');
  let currentSection: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect section headers
    if (line.startsWith('## Routes')) {
      currentSection = 'routes';
      continue;
    } else if (line.startsWith('## Navigation Links')) {
      currentSection = 'navLinks';
      continue;
    } else if (line.startsWith('## Stores')) {
      currentSection = 'stores';
      continue;
    } else if (line.startsWith('## Pages')) {
      currentSection = 'pages';
      continue;
    } else if (line.startsWith('## Components')) {
      currentSection = 'components';
      continue;
    } else if (line.startsWith('## Types')) {
      currentSection = 'types';
      continue;
    } else if (line.startsWith('## ')) {
      currentSection = null;
      continue;
    }

    // Skip empty lines, headers, and table separators
    if (!line || line.startsWith('#') || line.startsWith('|---') || line.startsWith('>')) {
      continue;
    }

    // Parse based on current section
    switch (currentSection) {
      case 'routes':
        if (line.startsWith('|')) {
          const parts = line.split('|').map(p => p.trim()).filter(p => p);
          if (parts.length >= 2 && parts[0] !== 'Path') {
            manifest.routes.push({
              path: parts[0],
              component: parts[1],
              file: parts[2] || undefined,
            });
          }
        }
        break;

      case 'navLinks':
        if (line.startsWith('-')) {
          const match = line.match(/^-\s*(.+?)\s*→\s*(.+)$/);
          if (match) {
            manifest.navLinks.push({
              label: match[1].trim(),
              path: match[2].trim(),
            });
          }
        }
        break;

      case 'stores':
        if (line.startsWith('|')) {
          const parts = line.split('|').map(p => p.trim()).filter(p => p);
          if (parts.length >= 3 && parts[0] !== 'Store') {
            manifest.stores.push({
              file: parts[1],
              exports: parts[2].split(',').map(e => e.trim()),
            });
          }
        }
        break;

      case 'pages':
        if (line.startsWith('|')) {
          const parts = line.split('|').map(p => p.trim()).filter(p => p);
          if (parts.length >= 2 && parts[0] !== 'Page') {
            manifest.pages.push({
              name: parts[0],
              file: parts[1],
              dependencies: parts[2] ? parts[2].split(',').map(d => d.trim()) : undefined,
            });
          }
        }
        break;

      case 'components':
        if (line.startsWith('|')) {
          const parts = line.split('|').map(p => p.trim()).filter(p => p);
          if (parts.length >= 2 && parts[0] !== 'Component') {
            manifest.components.push({
              name: parts[0],
              file: parts[1],
            });
          }
        }
        break;

      case 'types':
        if (line.startsWith('|')) {
          const parts = line.split('|').map(p => p.trim()).filter(p => p);
          if (parts.length >= 2 && parts[0] !== 'Type/Interface') {
            manifest.types.push({
              name: parts[0],
              file: parts[1],
              description: parts[2] || undefined,
            });
          }
        }
        break;
    }
  }

  return manifest;
}


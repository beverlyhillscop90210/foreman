import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

export interface KnowledgeNode {
  id: string;
  title: string;
  content: string;
  path: string;
  links: string[]; // IDs of linked nodes
}

export class KnowledgeGraph {
  private knowledgeDir: string;
  private nodes: Map<string, KnowledgeNode> = new Map();

  constructor() {
    this.knowledgeDir = process.env.KNOWLEDGE_DIR || join(process.env.HOME || '/home/foreman', 'knowledge');
    this.loadGraph();
  }

  /**
   * Load all markdown files from the knowledge directory and build the graph
   */
  private loadGraph(): void {
    if (!existsSync(this.knowledgeDir)) {
      console.warn(`⚠️  Knowledge directory not found: ${this.knowledgeDir}`);
      return;
    }

    try {
      this.traverseDirectory(this.knowledgeDir);
      console.log(`✅ Loaded ${this.nodes.size} knowledge nodes from ${this.knowledgeDir}`);
    } catch (error) {
      console.error(`❌ Failed to load knowledge graph from ${this.knowledgeDir}:`, error);
    }
  }

  /**
   * Recursively read markdown files
   */
  private traverseDirectory(dir: string): void {
    const files = readdirSync(dir);

    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        this.traverseDirectory(fullPath);
      } else if (extname(file) === '.md') {
        this.parseNode(fullPath);
      }
    }
  }

  /**
   * Parse a markdown file into a KnowledgeNode
   */
  private parseNode(filePath: string): void {
    const content = readFileSync(filePath, 'utf-8');
    
    // Generate ID from relative path (e.g., "zeon/architecture.md" -> "zeon/architecture")
    const relativePath = filePath.replace(this.knowledgeDir + '/', '');
    const id = relativePath.replace(/\.md$/, '');
    
    // Extract title from first H1, or use filename
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : basename(id);

    // Extract wikilinks: [[node-id]]
    const links: string[] = [];
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[1]);
    }

    this.nodes.set(id, {
      id,
      title,
      content,
      path: relativePath,
      links
    });
  }

  /**
   * Get a specific node by ID
   */
  getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Traverse the graph starting from a specific node, up to a certain depth
   */
  async traverse(startId: string, maxDepth: number = 2): Promise<KnowledgeNode[]> {
    const result: KnowledgeNode[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string, currentDepth: number) => {
      if (currentDepth > maxDepth || visited.has(nodeId)) return;
      
      const node = this.nodes.get(nodeId);
      if (!node) return;

      visited.add(nodeId);
      result.push(node);

      for (const linkId of node.links) {
        visit(linkId, currentDepth + 1);
      }
    };

    visit(startId, 0);
    return result;
  }

  /**
   * Get knowledge relevant to a specific project
   */
  async getForProject(project: string): Promise<KnowledgeNode[]> {
    // Try to find an index node for the project
    const indexId = `${project}/index`;
    if (this.nodes.has(indexId)) {
      return this.traverse(indexId, 2);
    }
    
    // Fallback: return all nodes in the project directory
    return Array.from(this.nodes.values()).filter(n => n.id.startsWith(`${project}/`));
  }

  /**
   * Get knowledge relevant to a specific role
   */
  async getForRole(role: string): Promise<KnowledgeNode[]> {
    const roleId = `roles/${role}`;
    if (this.nodes.has(roleId)) {
      return this.traverse(roleId, 1);
    }
    return [];
  }

  /**
   * Get knowledge relevant to specific files/scopes
   */
  async getForFiles(files: string[]): Promise<KnowledgeNode[]> {
    // In a real implementation, this would map file paths to knowledge nodes
    // For now, we just return a generic conventions node if it exists
    const conventionsId = 'conventions/code-style';
    if (this.nodes.has(conventionsId)) {
      return [this.nodes.get(conventionsId)!];
    }
    return [];
  }
}

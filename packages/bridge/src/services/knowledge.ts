import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: string;
  source_type: string;      // 'task' | 'web' | 'pdf' | 'md' | 'manual'
  source_url?: string;
  source_task_id?: string;
  tags: string[];
  metadata?: Record<string, any>;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  similarity?: number;       // Only present on semantic search results
}

/**
 * Knowledge service backed by Supabase pgvector.
 * Supports full-text search, semantic (vector) search via embeddings,
 * and standard CRUD operations.
 */
export class KnowledgeService {
  private supabase: SupabaseClient;
  private embeddingModel = 'text-embedding-3-small';

  constructor() {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      console.warn('KnowledgeService: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    }
    this.supabase = createClient(url, key);
  }

  // ── Embeddings ───────────────────────────────────────────────

  /**
   * Generate an embedding vector using OpenAI or OpenRouter.
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      return this.callEmbeddingAPI(
        'https://api.openai.com/v1/embeddings',
        openaiKey,
        this.embeddingModel,
        text,
      );
    }

    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      return this.callEmbeddingAPI(
        'https://openrouter.ai/api/v1/embeddings',
        openrouterKey,
        `openai/${this.embeddingModel}`,
        text,
      );
    }

    console.warn('KnowledgeService: No embedding API key (OPENAI_API_KEY / OPENROUTER_API_KEY). Storing without embedding.');
    return null;
  }

  private async callEmbeddingAPI(url: string, apiKey: string, model: string, text: string): Promise<number[] | null> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      });
      if (!res.ok) {
        console.error(`Embedding API error (${url}):`, res.status, await res.text());
        return null;
      }
      const data = await res.json() as any;
      return data.data[0].embedding;
    } catch (e) {
      console.error('Failed to generate embedding:', e);
      return null;
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────

  /**
   * List documents with optional text search and category filter.
   */
  async list(search?: string, category?: string): Promise<KnowledgeDocument[]> {
    if (search && search.trim()) {
      const { data, error } = await this.supabase.rpc('search_knowledge_documents', {
        search_query: search.trim(),
        filter_category: category && category !== 'All' ? category : null,
        result_limit: 50,
      });
      if (error) {
        console.error('Knowledge FTS error:', error);
        // Fall back to simple ILIKE search
        return this.simpleFallbackSearch(search, category);
      }
      return (data || []).map((d: any) => this.mapRow(d));
    }

    let query = this.supabase
      .from('knowledge_documents')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Knowledge list error:', error);
      return [];
    }
    return (data || []).map((d: any) => this.mapRow(d));
  }

  /** Simple fallback when FTS RPC is not yet available. */
  private async simpleFallbackSearch(search: string, category?: string): Promise<KnowledgeDocument[]> {
    let query = this.supabase
      .from('knowledge_documents')
      .select('*')
      .or(`title.ilike.%${search}%,content.ilike.%${search}%`)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Knowledge fallback search error:', error);
      return [];
    }
    return (data || []).map((d: any) => this.mapRow(d));
  }

  /**
   * Semantic search using vector similarity (cosine distance).
   */
  async semanticSearch(query: string, options?: {
    threshold?: number;
    limit?: number;
    category?: string;
  }): Promise<KnowledgeDocument[]> {
    const embedding = await this.generateEmbedding(query);
    if (!embedding) {
      return this.list(query, options?.category);
    }

    const { data, error } = await this.supabase.rpc('match_knowledge_documents', {
      query_embedding: embedding,
      match_threshold: options?.threshold ?? 0.5,
      match_count: options?.limit ?? 10,
      filter_category: options?.category && options.category !== 'All' ? options.category : null,
    });

    if (error) {
      console.error('Knowledge semantic search error:', error);
      return [];
    }
    return (data || []).map((d: any) => ({ ...this.mapRow(d), similarity: d.similarity }));
  }

  /**
   * Get a single document by ID.
   */
  async get(id: string): Promise<KnowledgeDocument | null> {
    const { data, error } = await this.supabase
      .from('knowledge_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  /**
   * Create a new knowledge document.
   * Automatically generates an embedding for semantic search.
   */
  async create(input: {
    title: string;
    content: string;
    category?: string;
    source_type?: string;
    source_url?: string;
    source_task_id?: string;
    tags?: string[];
    metadata?: Record<string, any>;
  }): Promise<KnowledgeDocument> {
    const embedding = await this.generateEmbedding(`${input.title}\n\n${input.content}`);

    const row: Record<string, any> = {
      title: input.title,
      content: input.content,
      category: input.category || 'General',
      source_type: input.source_type || 'manual',
      source_url: input.source_url || null,
      source_task_id: input.source_task_id || null,
      tags: input.tags || [],
      metadata: input.metadata || {},
    };
    if (embedding) row.embedding = embedding;

    const { data, error } = await this.supabase
      .from('knowledge_documents')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('Knowledge create error:', error);
      throw new Error(`Failed to create knowledge document: ${error.message}`);
    }

    console.log(`📚 Knowledge entry created: ${data.id} "${data.title}"`);
    return this.mapRow(data);
  }

  /**
   * Update a knowledge document. Re-generates embedding if title/content changed.
   */
  async update(id: string, updates: Partial<KnowledgeDocument>): Promise<KnowledgeDocument | null> {
    const row: Record<string, any> = {};
    if (updates.title !== undefined) row.title = updates.title;
    if (updates.content !== undefined) row.content = updates.content;
    if (updates.category !== undefined) row.category = updates.category;
    if (updates.tags !== undefined) row.tags = updates.tags;
    if (updates.source_url !== undefined) row.source_url = updates.source_url;
    if (updates.metadata !== undefined) row.metadata = updates.metadata;

    if (updates.title !== undefined || updates.content !== undefined) {
      const current = await this.get(id);
      if (current) {
        const embedding = await this.generateEmbedding(
          `${updates.title ?? current.title}\n\n${updates.content ?? current.content}`
        );
        if (embedding) row.embedding = embedding;
      }
    }

    const { data, error } = await this.supabase
      .from('knowledge_documents')
      .update(row)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Knowledge update error:', error);
      return null;
    }
    console.log(`📚 Knowledge entry updated: ${data.id} "${data.title}"`);
    return this.mapRow(data);
  }

  /**
   * Delete a knowledge document.
   */
  async delete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('knowledge_documents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Knowledge delete error:', error);
      return false;
    }
    console.log(`📚 Knowledge entry deleted: ${id}`);
    return true;
  }

  /**
   * Get all distinct categories.
   */
  async getCategories(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('knowledge_documents')
      .select('category');

    if (error || !data) return ['All'];
    const cats = new Set(data.map((d: any) => d.category));
    return ['All', ...Array.from(cats).sort()];
  }

  // ── Helpers ──────────────────────────────────────────────────

  private mapRow(row: any): KnowledgeDocument {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      source_type: row.source_type,
      source_url: row.source_url || undefined,
      source_task_id: row.source_task_id || undefined,
      tags: row.tags || [],
      metadata: row.metadata || {},
      size_bytes: Buffer.byteLength(row.content || '', 'utf-8'),
      created_at: row.created_at,
      updated_at: row.updated_at,
      similarity: row.similarity,
    };
  }
}

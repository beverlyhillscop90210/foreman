import { EventEmitter } from 'events';
import type { KanbanColumn, KanbanCard } from './types';

export class KanbanCoordinator extends EventEmitter {
  private cards: Map<string, KanbanCard> = new Map();

  /**
   * Add a card to the board
   */
  addCard(card: Omit<KanbanCard, 'id' | 'createdAt' | 'updatedAt'>): KanbanCard {
    const fullCard: KanbanCard = {
      ...card,
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.cards.set(fullCard.id, fullCard);
    this.emit('card:created', fullCard);
    return fullCard;
  }

  /**
   * Move card to a different column
   */
  moveCard(cardId: string, column: KanbanColumn): KanbanCard | null {
    const card = this.cards.get(cardId);
    if (!card) return null;
    const previousColumn = card.column;
    card.column = column;
    card.updatedAt = new Date().toISOString();
    this.emit('card:moved', { card, from: previousColumn, to: column });
    return card;
  }

  /**
   * Link a foreman task to a card and move to in_progress
   */
  assignAgent(cardId: string, taskId: string, agentId: string): KanbanCard | null {
    const card = this.cards.get(cardId);
    if (!card) return null;
    card.taskId = taskId;
    card.agentId = agentId;
    card.column = 'in_progress';
    card.updatedAt = new Date().toISOString();
    this.emit('card:assigned', card);
    return card;
  }

  /**
   * Handle task completion - move to review or commit_review based on QC
   */
  onTaskCompleted(taskId: string, qcResult?: { passed: boolean; score: number; summary: string }): void {
    for (const card of this.cards.values()) {
      if (card.taskId === taskId) {
        card.qcResult = qcResult;
        if (qcResult?.passed) {
          card.column = 'commit_review';
        } else {
          card.column = 'review'; // needs manual review
        }
        card.updatedAt = new Date().toISOString();
        this.emit('card:moved', { card, from: 'in_progress', to: card.column });
        break;
      }
    }
  }

  /**
   * Get all cards, optionally filtered
   */
  getCards(filter?: { column?: KanbanColumn; project?: string }): KanbanCard[] {
    let cards = Array.from(this.cards.values());
    if (filter?.column) cards = cards.filter(c => c.column === filter.column);
    if (filter?.project) cards = cards.filter(c => c.project === filter.project);
    return cards.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get board summary
   */
  getSummary(): Record<KanbanColumn, number> {
    const summary: Record<KanbanColumn, number> = {
      backlog: 0, in_progress: 0, review: 0, commit_review: 0, done: 0
    };
    for (const card of this.cards.values()) {
      summary[card.column]++;
    }
    return summary;
  }
}


/**
 * AI Processing Module Interfaces
 * Defines the contract for AI-powered meeting analysis results
 */

export interface ActionItem {
  task: string;
  owner: string;
  dueDate: string;
}

export interface ProductivityAnalysis {
  score: number;
  label: string;
  breakdown: {
    onTopicScore: number;
    decisionsScore: number;
    actionItemsScore: number;
    participationScore: number;
    timeEfficiency: number;
  };
  highlights: string[];
  improvements: string[];
}

export interface AiProcessingResult {
  summary: string;
  actionItems: ActionItem[];
  decisions: string[];
  nextSteps: string[];
  productivity: ProductivityAnalysis;
}

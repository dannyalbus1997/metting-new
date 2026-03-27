'use client';

import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ArrowRight, Clock } from 'lucide-react';

export interface ActionItem {
  id: string;
  description: string;
  owner: {
    id: string;
    name: string;
    avatar?: string;
  };
  dueDate: string | Date;
  completed: boolean;
}

interface ActionItemListProps {
  actionItems: ActionItem[];
  onToggleComplete?: (id: string, completed: boolean) => void;
  groupByOwner?: boolean;
}

type FilterType = 'all' | 'pending' | 'completed';

export default function ActionItemList({
  actionItems,
  onToggleComplete,
  groupByOwner = false,
}: ActionItemListProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Filter items
  const filteredItems = useMemo(() => {
    return actionItems.filter((item) => {
      if (filter === 'pending') return !item.completed;
      if (filter === 'completed') return item.completed;
      return true;
    });
  }, [actionItems, filter]);

  // Group by owner if requested
  const groupedItems = useMemo(() => {
    if (!groupByOwner) return { ungrouped: filteredItems };

    const grouped: Record<string, ActionItem[]> = {};
    filteredItems.forEach((item) => {
      if (!grouped[item.owner.id]) {
        grouped[item.owner.id] = [];
      }
      grouped[item.owner.id].push(item);
    });
    return grouped;
  }, [filteredItems, groupByOwner]);

  // Sort by due date
  const sortedItems = useMemo(() => {
    const itemsToSort = groupByOwner
      ? Object.values(groupedItems).flat()
      : groupedItems.ungrouped;

    return itemsToSort.sort(
      (a, b) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
  }, [groupedItems, groupByOwner]);

  const pendingCount = actionItems.filter((item) => !item.completed).length;
  const completedCount = actionItems.filter((item) => item.completed).length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="font-bold text-lg text-gray-900 mb-4">
          Action Items ({actionItems.length})
        </h3>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({actionItems.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'pending'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'completed'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Completed ({completedCount})
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="divide-y divide-gray-200">
        {sortedItems.length > 0 ? (
          sortedItems.map((item, index) => (
            <div
              key={item.id}
              className="px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex gap-4">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={(e) =>
                    onToggleComplete?.(item.id, e.target.checked)
                  }
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer flex-shrink-0 mt-1"
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium mb-2 ${
                      item.completed
                        ? 'text-gray-500 line-through'
                        : 'text-gray-900'
                    }`}
                  >
                    {item.description}
                  </p>

                  {/* Owner and Due Date */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Owner Badge */}
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1 w-fit">
                      <img
                        src={
                          item.owner.avatar ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.owner.id}`
                        }
                        alt={item.owner.name}
                        className="w-6 h-6 rounded-full"
                      />
                      <span className="text-xs font-medium text-gray-700">
                        {item.owner.name}
                      </span>
                    </div>

                    {/* Due Date */}
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <Clock className="w-3 h-3" />
                      {format(new Date(item.dueDate), 'MMM d, yyyy')}
                    </div>

                    {/* Arrow Indicator */}
                    <ArrowRight className="w-4 h-4 text-gray-300 hidden sm:block ml-auto" />
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-500">
              {filter === 'all'
                ? 'No action items found'
                : `No ${filter} action items`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

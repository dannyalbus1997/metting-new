'use client';

import React, { useState } from 'react';
import { ChevronDown, Copy, Check, Download } from 'lucide-react';
import Button from '@/components/ui/Button';

interface SummaryPanelProps {
  summary: string;
  decisions: string[];
  nextSteps: string[];
}

export default function SummaryPanel({
  summary,
  decisions,
  nextSteps,
}: SummaryPanelProps) {
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    summary: true,
    decisions: true,
    nextSteps: true,
  });
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleCopy = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleExport = async () => {
    const content = `MEETING SUMMARY
================

${summary}

DECISIONS
---------
${decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

NEXT STEPS
----------
${nextSteps.map((s) => `• ${s}`).join('\n')}
`;

    try {
      await navigator.clipboard.writeText(content);
      setCopiedSection('export');
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to export:', err);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Summary Section */}
      <div className="border-b border-gray-200">
        <button
          onClick={() => toggleSection('summary')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-bold text-lg text-gray-900">Summary</h3>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              icon={
                copiedSection === 'summary' ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )
              }
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(summary, 'summary');
              }}
            >
              Copy
            </Button>
            <ChevronDown
              className={`w-5 h-5 text-gray-400 transition-transform ${
                expandedSections.summary ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {expandedSections.summary && (
          <div className="px-6 pb-4 text-gray-700 leading-relaxed whitespace-pre-wrap">
            {summary}
          </div>
        )}
      </div>

      {/* Decisions Section */}
      <div className="border-b border-gray-200">
        <button
          onClick={() => toggleSection('decisions')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-bold text-lg text-gray-900">
            Decisions ({decisions.length})
          </h3>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform ${
              expandedSections.decisions ? 'rotate-180' : ''
            }`}
          />
        </button>

        {expandedSections.decisions && (
          <div className="px-6 pb-4 space-y-3">
            {decisions.length > 0 ? (
              decisions.map((decision, index) => (
                <div
                  key={index}
                  className="bg-indigo-50 rounded-lg p-4 border border-indigo-200"
                >
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 text-sm font-bold text-indigo-600">
                      {index + 1}.
                    </span>
                    <p className="text-gray-800">{decision}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No decisions recorded</p>
            )}
          </div>
        )}
      </div>

      {/* Next Steps Section */}
      <div className="border-b border-gray-200">
        <button
          onClick={() => toggleSection('nextSteps')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-bold text-lg text-gray-900">
            Next Steps ({nextSteps.length})
          </h3>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform ${
              expandedSections.nextSteps ? 'rotate-180' : ''
            }`}
          />
        </button>

        {expandedSections.nextSteps && (
          <div className="px-6 pb-4 space-y-2">
            {nextSteps.length > 0 ? (
              nextSteps.map((step, index) => (
                <div key={index} className="flex gap-3 text-gray-800">
                  <span className="text-indigo-600 flex-shrink-0">→</span>
                  <p>{step}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No next steps defined</p>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={
            copiedSection === 'export' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )
          }
          onClick={handleExport}
        >
          {copiedSection === 'export' ? 'Exported' : 'Export Summary'}
        </Button>
      </div>
    </div>
  );
}

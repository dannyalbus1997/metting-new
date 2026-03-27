'use client';

import React, { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import SearchInput from '@/components/ui/SearchInput';
import Button from '@/components/ui/Button';

interface TranscriptViewerProps {
  transcript: string;
  searchQuery?: string;
}

export default function TranscriptViewer({
  transcript,
  searchQuery: initialSearchQuery,
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [copied, setCopied] = useState(false);

  // Split transcript into paragraphs and add line numbers
  const paragraphs = useMemo(() => {
    return transcript.split('\n').filter((p) => p.trim().length > 0);
  }, [transcript]);

  // Highlight search matches
  const highlightedContent = useMemo(() => {
    if (!searchQuery.trim()) return paragraphs;

    const query = searchQuery.toLowerCase();
    return paragraphs.map((paragraph) => {
      if (paragraph.toLowerCase().includes(query)) {
        return paragraph.replace(
          new RegExp(`(${query})`, 'gi'),
          '<mark>$1</mark>'
        );
      }
      return paragraph;
    });
  }, [paragraphs, searchQuery]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const query = searchQuery.toLowerCase();
    return paragraphs.filter((p) => p.toLowerCase().includes(query)).length;
  }, [paragraphs, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-gray-200">
        <div className="flex-1 w-full sm:w-auto">
          <SearchInput
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
          {searchQuery && (
            <p className="text-xs text-gray-600 mt-2">
              Found in {matchCount} line{matchCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          onClick={handleCopy}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {/* Transcript Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-4">
          {highlightedContent.length > 0 ? (
            highlightedContent.map((paragraph, index) => (
              <div
                key={index}
                className="flex gap-4"
              >
                <span className="text-xs text-gray-400 font-mono flex-shrink-0 pt-1 w-12 text-right">
                  {index + 1}
                </span>
                <p
                  className="text-gray-700 leading-relaxed text-sm"
                  dangerouslySetInnerHTML={{
                    __html: paragraph,
                  }}
                  style={{
                    wordBreak: 'break-word',
                  }}
                />
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <p>No transcript content available</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer with CSS for highlight styling */}
      <style>{`
        mark {
          background-color: #fbbf24;
          padding: 0.1em 0.2em;
          border-radius: 0.2em;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

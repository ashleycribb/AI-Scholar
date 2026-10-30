import React from 'react';
import type { KnowledgeGraph, EntityType, Entity } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';

interface KnowledgeGraphDisplayProps {
    graph: KnowledgeGraph | undefined;
    state: 'idle' | 'loading' | 'loaded' | 'error' | undefined;
}

const entityColorMap: Record<EntityType, { bg: string; text: string; border: string }> = {
    Concept: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    Methodology: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    Finding: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
    Context: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
};

export const KnowledgeGraphDisplay: React.FC<KnowledgeGraphDisplayProps> = ({ graph, state }) => {
    if (state === 'loading') {
        return <LoadingSpinner message="Extracting knowledge graph..." />;
    }

    if (state === 'error') {
        return <ErrorMessage message="Failed to extract knowledge graph from the abstract." />;
    }

    if (state === 'loaded' && (!graph || graph.entities.length === 0)) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <h3 className="font-semibold">No Knowledge Graph Available</h3>
                <p className="text-sm mt-1">The AI could not extract a structured graph from this paper's abstract.</p>
            </div>
        );
    }

    if (!graph) return null;

    const entityMap = new Map(graph.entities.map(e => [e.id, e] as [string, Entity]));

    return (
        <div className="space-y-6">
            <div>
                <h4 className="font-semibold text-foreground mb-3">Extracted Entities</h4>
                <div className="flex flex-wrap gap-2">
                    {graph.entities.map(entity => (
                        <div key={entity.id} className={`px-3 py-1 rounded-full border text-sm font-medium ${entityColorMap[entity.type]?.bg} ${entityColorMap[entity.type]?.text} ${entityColorMap[entity.type]?.border}`} title={`${entity.type}: ${entity.description}`}>
                            {entity.label}
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h4 className="font-semibold text-foreground mb-3">Identified Relationships</h4>
                {graph.relationships.length > 0 ? (
                    <div className="space-y-3">
                        {graph.relationships.map((rel, index) => {
                            const source = entityMap.get(rel.source);
                            const target = entityMap.get(rel.target);
                            if (!source || !target) return null;

                            const sourceStyle = entityColorMap[source.type];
                            const targetStyle = entityColorMap[target.type];

                            if (!sourceStyle || !targetStyle) return null;

                            return (
                                <div key={index} className="p-3 bg-muted/50 border rounded-lg" title={rel.description}>
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${sourceStyle.bg} ${sourceStyle.text} ${sourceStyle.border}`}>
                                            {source.label}
                                        </span>
                                        <div className="flex-grow flex items-center gap-2 text-muted-foreground font-mono text-xs px-2">
                                            <div className="flex-grow border-b border-dashed"></div>
                                            <span>{rel.label}</span>
                                            <div className="flex-grow border-b border-dashed"></div>
                                            <span>&rarr;</span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${targetStyle.bg} ${targetStyle.text} ${targetStyle.border}`}>
                                            {target.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No relationships were identified between entities.</p>
                )}
            </div>
        </div>
    );
};
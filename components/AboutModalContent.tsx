
import React from 'react';

export const AboutModalContent: React.FC = () => {
  return (
    <div className="space-y-4">
      <p>
        The <strong>Scholar Explorer</strong> is an intelligent platform designed to streamline and accelerate the academic literature review process for doctoral students, researchers, and academics.
      </p>
      
      <h3>Core Features</h3>
      <ul className="space-y-2">
        <li>
          <strong>Deep Research Agent:</strong> An autonomous agent that breaks down complex topics into sub-queries, executes parallel searches, and synthesizes comprehensive, cited reports automatically.
        </li>
        <li>
          <strong>Workspace Analysis Dashboard:</strong> A powerful hub to analyze your saved collection. Generate comparative synthesis tables, identify research gaps, visualize bibliometric trends, and chat with your entire library.
        </li>
        <li>
          <strong>Semantic Search & Pivoting:</strong> Go beyond keywords with natural language queries. Use "Pivot Search" to find papers semantically similar to a specific article.
        </li>
        <li>
          <strong>Advanced Paper Analysis:</strong> Extract structured insights (methodology, findings, limitations), generate knowledge graphs, and find connected literature for any paper.
        </li>
        <li>
            <strong>Verification (VACS):</strong> Validate claims against specific papers using our Veracity, Accuracy, and Credibility Score (VACS) system, which analyzes metadata, citations, and textual evidence.
        </li>
        <li>
          <strong>Smart Discovery Tools:</strong> Find suitable journals for publication, filter results by institution (using ROR registry), and generate novel research ideas.
        </li>
      </ul>
      
      <p>
        Our mission is to harness the power of large language models to make research more efficient, insightful, and accessible, allowing you to focus on what matters most: generating new knowledge.
      </p>
    </div>
  );
};

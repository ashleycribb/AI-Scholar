
import React from 'react';

export const AboutModalContent: React.FC = () => {
  return (
    <div className="space-y-4">
      <p>
        The <strong>AI Research Explorer</strong> is an intelligent tool designed to streamline and accelerate the academic literature review process for doctoral students, researchers, and academics.
      </p>
      
      <h3>Core Features</h3>
      <ul>
        <li>
          <strong>Semantic Search:</strong> Go beyond keywords. Ask complex research questions in natural language to find papers that are thematically and conceptually related to your query.
        </li>
        <li>
          <strong>AI-Powered Summaries:</strong> Get instant, AI-generated overviews of your search results, helping you quickly grasp the key themes and findings across multiple papers.
        </li>
        <li>
          <strong>Advanced Paper Analysis:</strong> For any paper, you can use AI to find connected literature, perform a structured analysis of its key components, or generate new research ideas.
        </li>
        <li>
            <strong>Advanced Verification (VACS):</strong> For papers with a DOI, you can run an in-depth verification of a specific claim. The system calculates a VACS (Veracity, Accuracy, Credibility Score) based on metadata, citation context, and textual evidence.
        </li>
        <li>
          <strong>Project Workspace:</strong> Save papers to a dedicated workspace, organize them into projects, and run synthesis or gap analysis on your entire collection.
        </li>
      </ul>
      
      <p>
        Our mission is to harness the power of large language models to make research more efficient, insightful, and accessible, allowing you to focus on what matters most: generating new knowledge.
      </p>
    </div>
  );
};

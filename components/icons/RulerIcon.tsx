
import React from 'react';

export const RulerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6.375l-3.375 3.375m-3.375 0l-3.375-3.375m3.375 3.375V3m0 3.375L8.625 6.375m3.375 3.375L15.375 6.375m0 9.75l-3.375-3.375m3.375 3.375L18.375 12m-3.375 3.375v3.375M12 12l-3.375 3.375m3.375-3.375L8.625 12" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
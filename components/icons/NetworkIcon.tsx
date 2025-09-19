import React from 'react';

export const NetworkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9.31L12.7 14.3a.75.75 0 01-1.06 0L9.31 12.7 4.97 17.03a.75.75 0 01-1.06-1.06l4.72-4.72a.75.75 0 011.06 0l2.34 2.34 4.39-4.39H15a.75.75 0 010-1.5h3.75z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75c0-1.036.84-1.875 1.875-1.875h12.75c1.035 0 1.875.84 1.875 1.875v12.75c0 1.035-.84 1.875-1.875 1.875H5.625c-1.036 0-1.875-.84-1.875-1.875V3.75z" />
    </svg>
);

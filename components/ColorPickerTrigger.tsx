import React, { useState, useRef } from 'react';
import type { Project } from '../types';
import { useOutsideClick } from '../src/hooks/useOutsideClick';
import { colorClassMap, PROJECT_COLORS } from './ProjectConfig';

export const ColorPickerTrigger: React.FC<{
    project: Project;
    onUpdateColor: (projectId: string, color: string) => void;
}> = ({ project, onUpdateColor }) => {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);
    useOutsideClick(pickerRef, () => setIsPickerOpen(false));

    const colorBgClass = colorClassMap[project.color]?.bg || 'bg-primary';

    return (
        <div className="relative" ref={pickerRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsPickerOpen(p => !p); }}
                className={`w-5 h-5 rounded-full ${colorBgClass} border-2 border-white ring-1 ring-border transition-transform hover:scale-110`}
                title="Change project color"
            />
            {isPickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-card p-2 rounded-md shadow-lg border z-20">
                    <div className="grid grid-cols-4 gap-2">
                        {PROJECT_COLORS.map(color => (
                            <button
                                key={color}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateColor(project.id, color);
                                    setIsPickerOpen(false);
                                }}
                                className={`w-7 h-7 rounded-full ${colorClassMap[color].bg} border-2 transition-all ${project.color === color ? 'border-primary ring-2 ring-ring ring-offset-1' : 'border-card hover:border-border'}`}
                                aria-label={`Select ${color} color`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
